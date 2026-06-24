import type { IInventoryItem } from '../models/inventory-item';
import type { IMealPlan } from '../types/meal-plan';
import type { IGroceryListItem, GroceryCategory } from '../types/grocery-list';
import { GROCERY_CATEGORIES } from '../types/grocery-list';
import { normalizeIngredientName, matchIngredients } from './ingredient-matcher';
import { inferCategory } from './ingredient-categorizer';
import { canSubtract, netNeeded } from './unit-normalizer';

export interface GenerateResult {
  items: IGroceryListItem[];
  generatedAt: Date;
}

/**
 * Generates a grocery list from a meal plan and current (non-expired) inventory.
 *
 * Algorithm:
 * 1. Collect missingIngredients from all meal plan entries
 * 2. Normalize and group ingredient names by canonical key
 * 3. Quantity = number of meals referencing each ingredient; unit = 'servings'
 * 4. Subtract matching non-expired inventory items where units are compatible
 * 5. Categorize and sort
 */
export function generateGroceryList(
  mealPlan: IMealPlan,
  inventoryItems: IInventoryItem[],
): GenerateResult {
  // Phase A: collect all missingIngredients with their source meal name
  const ingredientSources: Array<{ name: string; mealName: string }> = [];

  for (const entry of mealPlan.entries) {
    for (const ingredient of entry.meal.missingIngredients) {
      ingredientSources.push({ name: ingredient, mealName: entry.meal.mealName });
    }
  }

  // Phase B: normalize and group
  const nameGroups = matchIngredients(ingredientSources.map((s) => s.name));

  // Build initial items with quantity = count of contributing meals
  const items: IGroceryListItem[] = [];

  for (const [canonical, group] of nameGroups) {
    // Count how many meal entries mention this ingredient
    const quantity = ingredientSources.filter(
      (s) => normalizeIngredientName(s.name) === canonical,
    ).length;

    const sourceMealNames = [
      ...new Set(
        ingredientSources
          .filter((s) => normalizeIngredientName(s.name) === canonical)
          .map((s) => s.mealName),
      ),
    ];

    items.push({
      ingredientName: canonical,
      displayName: group.displayName,
      quantity,
      unit: 'servings',
      category: inferCategory(canonical),
      isPurchased: false,
      isManuallyAdded: false,
      sourceMealNames,
      notes: '',
    });
  }

  // Phase C: subtract non-expired inventory where units are compatible.
  // Note: auto-generated items use unit='servings' (a count of meals), which is
  // incompatible with real inventory units. Subtraction therefore applies only when
  // recipe quantities are later introduced (future enhancement). For now, all items
  // pass through unchanged.
  const resultItems = items.filter((item) => {
    const matchingInventory = inventoryItems.find((inv) => {
      const invCanonical = normalizeIngredientName(inv.name);
      return (
        invCanonical === item.ingredientName &&
        canSubtract(item.unit, inv.unit)
      );
    });

    if (!matchingInventory) return true;

    const net = netNeeded(item.quantity, item.unit, matchingInventory.quantity, matchingInventory.unit);
    if (net === null) return true;

    // Update the item's quantity to the net amount needed
    item.quantity = net.netQty;
    item.unit = net.netUnit;
    // Drop the item if we already have enough
    return net.netQty > 0;
  });

  // Phase D & E: categorize (already done inline) and sort
  const categoryOrder = new Map(GROCERY_CATEGORIES.map((c, i) => [c, i]));

  resultItems.sort((a, b) => {
    const catA = categoryOrder.get(a.category as GroceryCategory) ?? 999;
    const catB = categoryOrder.get(b.category as GroceryCategory) ?? 999;
    if (catA !== catB) return catA - catB;
    return a.displayName.localeCompare(b.displayName);
  });

  return { items: resultItems, generatedAt: new Date() };
}
