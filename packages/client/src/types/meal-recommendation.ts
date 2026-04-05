export interface MealRecommendation {
  mealName: string;
  suggestedMealType: 'breakfast' | 'lunch' | 'dinner';
  prepTimeMinutes: number;
  cuisine: string;
  description: string;
  usesIngredients: string[];
  expiringIngredients: string[];
  missingIngredients: string[];
  recipeUrl?: string;
  imageUrl?: string;
}
