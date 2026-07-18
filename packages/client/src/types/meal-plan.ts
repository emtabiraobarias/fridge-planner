import type { MealRecommendation } from './meal-recommendation';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Spec 006 FR-MC-007: entry lifecycle — planning is intent, cooking is fact. */
export type EntryStatus = 'planned' | 'cooked';

export interface DepletedItemSnapshot {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  location: string;
  expiresAt?: string;
}

/** One line of a consumption receipt (spec 006 FR-MC-012). */
export interface ConsumptionReceiptLine {
  inventoryItemId?: string;
  name: string;
  quantityConsumed: number;
  unit: string;
  depletedSnapshot?: DepletedItemSnapshot;
}

export interface MealPlanEntry {
  slotId: string;
  date: string;
  mealType: MealType;
  meal: MealRecommendation;
  /** ABSENT = legacy entry = cooked (spec 006 FR-MC-011); the server owns this field. */
  status?: EntryStatus;
  cookedAt?: string;
  consumedItems?: ConsumptionReceiptLine[];
}

/** The one effective-status rule (spec 006): missing status = cooked. */
export function entryStatus(entry: Pick<MealPlanEntry, 'status'>): EntryStatus {
  return entry.status ?? 'cooked';
}

export interface MealPlan {
  _id: string;
  userId: string;
  weekStart: string;
  entries: MealPlanEntry[];
  createdAt: string;
  updatedAt: string;
}
