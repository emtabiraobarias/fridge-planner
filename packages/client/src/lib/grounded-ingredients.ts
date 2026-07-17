import type { MealRecommendation } from '../types/meal-recommendation';

/**
 * Spec 006 US1: map a meal's grounded ingredients to display amounts,
 * keyed by lower-cased ingredient name (e.g. "chicken thighs" → "500 g").
 * Names without a usable quantity are simply absent.
 */
export function groundedAmounts(meal: MealRecommendation): Map<string, string> {
  const amounts = new Map<string, string>();
  for (const g of meal.groundedIngredients ?? []) {
    if (g.quantityToConsume !== undefined && g.unit) {
      amounts.set(g.name.toLowerCase(), `${g.quantityToConsume} ${g.unit}`);
    }
  }
  return amounts;
}

/** "Chicken · 500 g" when grounded, else the bare name. */
export function withGroundedAmount(name: string, amounts: Map<string, string>): string {
  const amount = amounts.get(name.toLowerCase());
  return amount ? `${name} · ${amount}` : name;
}
