import type { MealRecommendation } from './meal-recommendation';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MealPlanEntry {
  slotId: string;
  date: string;
  mealType: MealType;
  meal: MealRecommendation;
}

export interface MealPlan {
  _id: string;
  userId: string;
  weekStart: string;
  entries: MealPlanEntry[];
  createdAt: string;
  updatedAt: string;
}
