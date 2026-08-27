import 'server-only';
import type { Model } from 'mongoose';
import { InventoryItem } from '../models/inventory-item';
import { MealPlan } from '../models/meal-plan';
import { GroceryList } from '../models/grocery-list';
import { IngredientAlias } from '../models/ingredient-alias';
import { FeedbackRecord } from '../models/feedback-record';
import { LifecycleItem } from '../models/lifecycle-item';
import { ERASED_REPORTER } from '../types/lifecycle';

/**
 * Every collection whose records are DELETED with the user (spec 011 FR-AD-018 "no orphans").
 *
 * ONE table, iterated once — not six call sites — so "did we get them all?" is a
 * question with a single answer that a test can assert against, and adding a seventh
 * user-keyed collection later means adding one line here rather than remembering six
 * places. Keeping it a table is also what holds `purgeUser` under the complexity limit.
 *
 * Audit entries are deliberately NOT in this list: `admin_audit_logs.subjectUserId` is
 * evidence *about an administrative action*, retained on its own 90-day TTL
 * (FR-AD-023), not the user's own data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous models, keyed identically
export const USER_KEYED_MODELS: ReadonlyArray<{ name: string; model: Model<any> }> = [
  { name: 'inventory-item', model: InventoryItem },
  { name: 'meal-plan', model: MealPlan },
  { name: 'grocery-list', model: GroceryList },
  { name: 'ingredient-alias', model: IngredientAlias },
  { name: 'feedback-record', model: FeedbackRecord },
];

/**
 * Collections that are DETACHED rather than deleted (spec 012 D15, FR-FL-059..061).
 *
 * ⚠️ A SECOND list with DIFFERENT semantics. Until 2026-08-24 the lifecycle collection sat in
 * `USER_KEYED_MODELS` above and was `deleteMany`'d, so erasing a reporter destroyed every item
 * their report had started — including maintainer work in flight, and work other people were
 * waiting on. D15 settles it the other way: the work outlives the account.
 *
 * A detached item is NOT an orphan for FR-AD-018's purposes — detachment is the *defined*
 * outcome, not a leak. It keeps no reporter-identifying content and stays advanceable and
 * closable (FR-FL-061).
 *
 * Anonymising by hashing the userId was rejected: a hash is still a per-user key, so it
 * re-identifies the same person across collections.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous models, keyed identically
export const USER_DETACHED_MODELS: ReadonlyArray<{ name: string; model: Model<any> }> = [
  { name: 'lifecycle-item', model: LifecycleItem },
];

/**
 * Every collection holding something about a user, whichever way erasure treats it.
 *
 * Exists so the FR-AD-017 export's `collections` manifest is derived from the same source as its
 * contents. Listing only the delete-list would under-report what is held — the opposite of what
 * a data export is for.
 */
export const ALL_USER_DATA_MODELS = [...USER_KEYED_MODELS, ...USER_DETACHED_MODELS];

export type PurgeCounts = Record<string, number>;

/**
 * Irreversibly remove a user: DELETE their own data, DETACH the work it started.
 *
 * Counts cover both, keyed by collection name, so a caller can tell retention apart from
 * deletion — "6 deleted" would hide the fact that anything survived at all.
 */
export async function purgeUserData(userId: string): Promise<PurgeCounts> {
  const counts: PurgeCounts = {};

  for (const { name, model } of USER_KEYED_MODELS) {
    const res = await model.deleteMany({ userId });
    counts[name] = res.deletedCount ?? 0;
  }

  for (const { name, model } of USER_DETACHED_MODELS) {
    const res = await model.updateMany(
      { userId },
      {
        $set: {
          userId: ERASED_REPORTER,
          // The snapshot was the reporter's own words; it cannot survive their erasure.
          sourceTitle: '(reporter erased)',
          reporterErasedAt: new Date(),
        },
        // The reply was written FOR a reporter who no longer exists.
        $unset: { reply: '' },
      },
    );
    counts[name] = res.modifiedCount ?? 0;
  }

  return counts;
}

/**
 * Everything held about a user, for FR-AD-017 export.
 *
 * Spans BOTH lists: an export that omitted the lifecycle items would under-report what is held
 * about someone, which is the opposite of what a data export is for.
 */
export async function collectUserData(userId: string): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const { name, model } of ALL_USER_DATA_MODELS) {
    out[name] = await model.find({ userId }).lean();
  }
  return out;
}
