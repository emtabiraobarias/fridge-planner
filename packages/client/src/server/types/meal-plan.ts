import type { MealRecommendation } from './meal-recommendation';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export interface IMealPlanEntry {
  slotId: string;
  date: Date;
  mealType: MealType;
  meal: MealRecommendation;
}

export interface IMealPlan {
  userId: string;
  weekStart: Date;
  entries: IMealPlanEntry[];
  createdAt: Date;
  updatedAt: Date;
}
