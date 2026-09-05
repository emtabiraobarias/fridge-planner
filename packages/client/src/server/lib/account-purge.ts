import 'server-only';
import type { Model } from 'mongoose';
import { asAccountId } from './account-id';
import { Account } from '../models/account';
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
 *
 * `key` names the field holding the user identifier, and exists for exactly one entry.
 * Spec 013's `accounts` IS the user — it is keyed by `_id`, not by a `userId` field — so
 * listing it without saying so would produce a delete that matches nothing and a purge that
 * silently leaves the person's identity and email address behind after deleting everything
 * else about them. Defaulted rather than required so the other six read as before.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous models, keyed identically
export const USER_KEYED_MODELS: ReadonlyArray<{ name: string; model: Model<any>; key?: string }> = [
  { name: 'inventory-item', model: InventoryItem },
  { name: 'meal-plan', model: MealPlan },
  { name: 'grocery-list', model: GroceryList },
  { name: 'ingredient-alias', model: IngredientAlias },
  { name: 'feedback-record', model: FeedbackRecord },
  // The SEVENTH store (spec 013). Last on purpose: it is the identity the other six hang
  // off, so deleting it first would leave nothing to scope their deletes by if a later step
  // failed halfway.
  { name: 'account', model: Account, key: '_id' },
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
export const USER_DETACHED_MODELS: ReadonlyArray<{ name: string; model: Model<any>; key?: string }> =
  [{ name: 'lifecycle-item', model: LifecycleItem }];

/**
 * The filter that selects one user's documents in a given store, or `null` when the store
 * cannot hold anything for this user at all.
 *
 * The null case is the `_id`-keyed `accounts` entry meeting an identifier that is not an
 * ObjectId — a pre-migration provider subject, or a dev-seam id like `demo-admin`. Mongoose
 * THROWS a CastError on those rather than matching nothing, and an exception here would
 * abort the purge partway through, after some collections had already been emptied. Skipping
 * is correct as well as safe: an id that cannot be an `accounts._id` names no account.
 *
 * See `account-id.ts` — the same trap was written three times before it got a name.
 */
function scope(userId: string, key: string | undefined): Record<string, string> | null {
  if ((key ?? 'userId') !== '_id') return { [key ?? 'userId']: userId };
  const id = asAccountId(userId);
  return id ? { _id: id } : null;
}

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

  for (const { name, model, key } of USER_KEYED_MODELS) {
    const filter = scope(userId, key);
    if (!filter) {
      counts[name] = 0;
      continue;
    }
    const res = await model.deleteMany(filter);
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
  for (const { name, model, key } of ALL_USER_DATA_MODELS) {
    const filter = scope(userId, key);
    out[name] = filter ? await model.find(filter).lean() : [];
  }
  return out;
}
