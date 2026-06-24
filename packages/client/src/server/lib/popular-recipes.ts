import type { MealRecommendation } from '../types/meal-recommendation';

/**
 * Static "popular recipes" served as a graceful fallback when personalised AI
 * recommendations are unavailable:
 *   - the meal-recommender agent is down / times out (EC-08, SC-010), or
 *   - there is nothing to recommend from — empty or all-expired inventory (EC-01).
 *
 * Not personalised; the response carries a `fallback` flag so the client can label
 * these as generic suggestions and prompt the user to add inventory.
 */
export const POPULAR_RECIPES: readonly MealRecommendation[] = [
  {
    mealName: 'Vegetable Fried Rice',
    suggestedMealType: 'dinner',
    prepTimeMinutes: 20,
    cuisine: 'Filipino',
    description: 'A quick everyday fried rice using whatever vegetables you have on hand.',
    usesIngredients: [],
    expiringIngredients: [],
    missingIngredients: ['rice', 'mixed vegetables', 'soy sauce', 'egg', 'garlic'],
  },
  {
    mealName: 'Chicken Adobo',
    suggestedMealType: 'dinner',
    prepTimeMinutes: 45,
    cuisine: 'Filipino',
    description: 'Classic braised chicken in soy sauce, vinegar, garlic and bay leaves.',
    usesIngredients: [],
    expiringIngredients: [],
    missingIngredients: ['chicken', 'soy sauce', 'vinegar', 'garlic', 'bay leaves'],
  },
  {
    mealName: 'Tomato Garlic Pasta',
    suggestedMealType: 'dinner',
    prepTimeMinutes: 25,
    cuisine: 'Italian',
    description: 'Simple weeknight pasta in a garlicky tomato sauce.',
    usesIngredients: [],
    expiringIngredients: [],
    missingIngredients: ['pasta', 'canned tomatoes', 'garlic', 'olive oil'],
  },
  {
    mealName: 'Vegetable Omelette',
    suggestedMealType: 'breakfast',
    prepTimeMinutes: 10,
    cuisine: 'Western',
    description: 'A fast, protein-rich omelette with onion and whatever veg is around.',
    usesIngredients: [],
    expiringIngredients: [],
    missingIngredients: ['eggs', 'onion', 'cheese'],
  },
];
