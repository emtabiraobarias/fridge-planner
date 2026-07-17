export type GroundedResolution = 'direct' | 'fuzzy' | 'alias' | 'unresolved';

/**
 * A meal ingredient tied to a specific owned inventory item (spec 006 FR-MC-001).
 * Produced only by server-side validation of the untrusted agent payload
 * (lib/ingredient-grounding.ts) — never trusted from the wire.
 */
export interface GroundedIngredient {
  inventoryItemId?: string;
  name: string;
  /** Positive, clamped to owned stock at delivery; absent = matched but unquantified (legacy 1-unit rule). */
  quantityToConsume?: number;
  unit?: string;
  resolution: GroundedResolution;
}

export interface MealRecommendation {
  mealName: string;
  suggestedMealType: 'breakfast' | 'lunch' | 'dinner';
  prepTimeMinutes: number;
  cuisine: string;
  description: string;
  usesIngredients: string[];
  expiringIngredients: string[];
  missingIngredients: string[];
  /** Spec 006: inventory-grounded quantified ingredients; absent on fallback/legacy meals. */
  groundedIngredients?: GroundedIngredient[];
  recipeUrl?: string;
  imageUrl?: string;
}
