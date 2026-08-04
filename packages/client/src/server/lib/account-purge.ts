import 'server-only';
import type { Model } from 'mongoose';
import { InventoryItem } from '../models/inventory-item';
import { MealPlan } from '../models/meal-plan';
import { GroceryList } from '../models/grocery-list';
import { IngredientAlias } from '../models/ingredient-alias';
import { FeedbackRecord } from '../models/feedback-record';
import { PipelineItem } from '../models/pipeline-item';

/**
 * Every collection that keys records to a user (spec 011 FR-AD-018 "no orphans").
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
  { name: 'pipeline-item', model: PipelineItem },
];

export type PurgeCounts = Record<string, number>;

/** Irreversibly delete every document keyed to `userId`. */
export async function purgeUserData(userId: string): Promise<PurgeCounts> {
  const counts: PurgeCounts = {};
  for (const { name, model } of USER_KEYED_MODELS) {
    const res = await model.deleteMany({ userId });
    counts[name] = res.deletedCount ?? 0;
  }
  return counts;
}

/** Everything held about a user, for FR-AD-017 export. */
export async function collectUserData(userId: string): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const { name, model } of USER_KEYED_MODELS) {
    out[name] = await model.find({ userId }).lean();
  }
  return out;
}
