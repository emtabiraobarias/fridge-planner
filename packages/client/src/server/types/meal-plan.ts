import type { MealRecommendation } from './meal-recommendation';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

/** Spec 006 FR-MC-007: entry lifecycle — planning is intent, cooking is fact. */
export type EntryStatus = 'planned' | 'cooked';

/** Snapshot of an item removed by depletion — everything needed to recreate it
 *  on un-cook. `expirationStatus` is deliberately absent: the pre-save hook
 *  recomputes it (CLAUDE.md §14). */
export interface DepletedItemSnapshot {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  location: string;
  expiresAt?: Date;
}

/** One line of a consumption receipt (spec 006 FR-MC-012). `inventoryItemId`
 *  is absent for lines that matched nothing (recorded as not consumed). */
export interface ConsumptionReceiptLine {
  inventoryItemId?: string;
  name: string;
  /** Actual amount deducted, in `unit` (the item's unit); 0 = not consumed. */
  quantityConsumed: number;
  unit: string;
  depletedSnapshot?: DepletedItemSnapshot;
}

export interface IMealPlanEntry {
  slotId: string;
  date: Date;
  mealType: MealType;
  meal: MealRecommendation;
  /** ABSENT = legacy entry = cooked (spec 006 FR-MC-011 cutover); new writes always set it. */
  status?: EntryStatus;
  cookedAt?: Date;
  consumedItems?: ConsumptionReceiptLine[];
}

/** The one effective-status rule (spec 006 data-model): missing status = cooked. */
export function entryStatus(entry: Pick<IMealPlanEntry, 'status'>): EntryStatus {
  return entry.status ?? 'cooked';
}

export interface IMealPlan {
  userId: string;
  weekStart: Date;
  entries: IMealPlanEntry[];
  createdAt: Date;
  updatedAt: Date;
}
