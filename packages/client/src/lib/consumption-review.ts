import type { InventoryItem } from '../services/inventory';
import type { MealRecommendation } from '../types/meal-recommendation';

export interface ConsumptionReviewLine {
  inventoryItemId: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface ConsumptionReview {
  lines: ConsumptionReviewLine[];
  unresolved: string[];
}

function byId(items: InventoryItem[], id: string | undefined): InventoryItem | undefined {
  if (!id) return undefined;
  return items.find((item) => item._id === id);
}

function byName(items: InventoryItem[], name: string): InventoryItem | undefined {
  return items.find((item) => item.name.toLowerCase() === name.toLowerCase());
}

function clamp(quantity: number, owned: number): number {
  return Math.max(0, Math.min(quantity, owned));
}

export function buildReviewLines(meal: MealRecommendation, inventory: InventoryItem[]): ConsumptionReview {
  const lines: ConsumptionReviewLine[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  for (const ingredient of meal.groundedIngredients ?? []) {
    const item = byId(inventory, ingredient.inventoryItemId);
    if (!item) {
      unresolved.push(ingredient.name);
      continue;
    }
    if (seen.has(item._id)) continue; // two ingredients resolved to one item → one row

    seen.add(item._id);
    const quantity =
      ingredient.quantityToConsume !== undefined ? clamp(ingredient.quantityToConsume, item.quantity) : 1;
    lines.push({
      inventoryItemId: item._id,
      name: item.name,
      quantity,
      unit: ingredient.unit ?? item.unit,
    });
  }

  if (meal.groundedIngredients) {
    return { lines, unresolved };
  }

  for (const name of meal.usesIngredients) {
    const item = byName(inventory, name);
    if (!item) {
      unresolved.push(name); // surfaced read-only, like the grounded path (FR-MC-009)
      continue;
    }
    if (seen.has(item._id)) continue;
    seen.add(item._id);
    lines.push({ inventoryItemId: item._id, name: item.name, quantity: 1, unit: item.unit });
  }

  return { lines, unresolved };
}
