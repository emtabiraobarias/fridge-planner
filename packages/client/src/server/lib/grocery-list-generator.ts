import type { IInventoryItem } from '../models/inventory-item';
import { entryStatus, type IMealPlan, type IMealPlanEntry } from '../types/meal-plan';
import type { IGroceryListItem, GroceryCategory } from '../types/grocery-list';
import { GROCERY_CATEGORIES } from '../types/grocery-list';
import { normalizeIngredientName, matchIngredients } from './ingredient-matcher';
import { inferCategory } from './ingredient-categorizer';
import { canSubtract, netNeeded, normalizeUnit, type DimensionFamily } from './unit-normalizer';

export interface GenerateResult {
  items: IGroceryListItem[];
  generatedAt: Date;
}

/**
 * Generates a grocery list from a meal plan and current (non-expired) inventory.
 *
 * Spec 006 US4 (FR-MC-016..019): only PLANNED entries generate needs (cooked meals'
 * consumption is already reflected in inventory; legacy no-status entries count as
 * cooked). Two line sources:
 *  (a) grounded quantified ingredients — summed per canonical name in base units,
 *      netted against owned stock; only the shortfall is listed, fully-covered
 *      ingredients are omitted, and a name mixing incompatible unit families falls
 *      back to the servings count for that line (FR-MC-017);
 *  (b) missingIngredients — the original servings model (FR-026 fallback).
 *
 * Spec 008 US1 (FR-RG-001/003): when `asOf` is supplied, only `planned` entries
 * dated today-or-later (`entry.date >= asOf`) contribute needs — past meals stop
 * generating shopping needs. Omitting `asOf` preserves the pre-008 (007 lazy) path.
 */
export function generateGroceryList(
  mealPlan: IMealPlan,
  inventoryItems: IInventoryItem[],
  asOf?: Date,
): GenerateResult {
  const planned = mealPlan.entries.filter(
    (e) =>
      entryStatus(e) === 'planned' &&
      (asOf === undefined || e.date.getTime() >= asOf.getTime()),
  );

  const items = [
    ...groundedShortfallLines(planned, inventoryItems),
    ...missingServingsLines(planned, inventoryItems),
  ];

  sortByCategory(items);
  return { items, generatedAt: new Date() };
}

// ——— (a) grounded quantified needs ———

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface GroundedNeed {
  displayName: string;
  family: DimensionFamily;
  baseUnit: string;
  totalBase: number;
  mealNames: Set<string>;
  mixedFamilies: boolean;
}

function accumulateNeed(
  needs: Map<string, GroundedNeed>,
  mealName: string,
  g: NonNullable<IMealPlanEntry['meal']['groundedIngredients']>[number],
): void {
  if (g.quantityToConsume === undefined || !g.unit || g.resolution === 'unresolved') return;
  const canonical = normalizeIngredientName(g.name);
  if (!canonical) return;

  const n = normalizeUnit(g.quantityToConsume, g.unit);
  const existing = needs.get(canonical);
  if (!existing) {
    needs.set(canonical, {
      displayName: g.name,
      family: n.family,
      baseUnit: n.baseUnit,
      totalBase: n.value,
      mealNames: new Set([mealName]),
      mixedFamilies: n.family === 'unknown',
    });
    return;
  }

  existing.mealNames.add(mealName);
  if (existing.family !== n.family || n.family === 'unknown') {
    existing.mixedFamilies = true; // reconciliation impossible → servings fallback
  } else {
    existing.totalBase += n.value;
  }
}

function collectGroundedNeeds(entries: IMealPlanEntry[]): Map<string, GroundedNeed> {
  const needs = new Map<string, GroundedNeed>();
  for (const entry of entries) {
    for (const g of entry.meal.groundedIngredients ?? []) {
      accumulateNeed(needs, entry.meal.mealName, g);
    }
  }
  return needs;
}

function groundedShortfallLines(
  entries: IMealPlanEntry[],
  inventoryItems: IInventoryItem[],
): IGroceryListItem[] {
  const lines: IGroceryListItem[] = [];

  for (const [canonical, need] of collectGroundedNeeds(entries)) {
    if (need.mixedFamilies) {
      lines.push(listItem(canonical, need, need.mealNames.size, 'servings'));
      continue;
    }

    const owned = inventoryItems.find(
      (inv) =>
        normalizeIngredientName(inv.name) === canonical &&
        normalizeUnit(1, inv.unit).family === need.family,
    );
    const ownedBase = owned ? normalizeUnit(owned.quantity, owned.unit).value : 0;
    const shortfall = round2(need.totalBase - ownedBase);
    if (shortfall <= 0) continue; // fully covered → omitted (FR-MC-016)

    lines.push(listItem(canonical, need, shortfall, need.baseUnit));
  }

  return lines;
}

function listItem(
  canonical: string,
  need: GroundedNeed,
  quantity: number,
  unit: string,
): IGroceryListItem {
  return {
    ingredientName: canonical,
    displayName: toTitleCase(need.displayName),
    quantity,
    unit,
    category: inferCategory(canonical),
    isPurchased: false,
    isManuallyAdded: false,
    sourceMealNames: [...need.mealNames],
    notes: '',
  };
}

// ——— (b) missing ingredients — the servings model (FR-026 fallback) ———

function missingServingsLines(
  entries: IMealPlanEntry[],
  inventoryItems: IInventoryItem[],
): IGroceryListItem[] {
  const ingredientSources: Array<{ name: string; mealName: string }> = [];
  for (const entry of entries) {
    for (const ingredient of entry.meal.missingIngredients) {
      ingredientSources.push({ name: ingredient, mealName: entry.meal.mealName });
    }
  }

  const nameGroups = matchIngredients(ingredientSources.map((s) => s.name));
  const items: IGroceryListItem[] = [];

  for (const [canonical, group] of nameGroups) {
    const contributing = ingredientSources.filter(
      (s) => normalizeIngredientName(s.name) === canonical,
    );
    items.push({
      ingredientName: canonical,
      displayName: group.displayName,
      quantity: contributing.length,
      unit: 'servings',
      category: inferCategory(canonical),
      isPurchased: false,
      isManuallyAdded: false,
      sourceMealNames: [...new Set(contributing.map((s) => s.mealName))],
      notes: '',
    });
  }

  // Subtract non-expired inventory where units are compatible. Servings lines are
  // incompatible with real units by construction, so this only bites when a line
  // carries real amounts (kept for parity with the pre-006 behaviour).
  return items.filter((item) => {
    const matchingInventory = inventoryItems.find(
      (inv) =>
        normalizeIngredientName(inv.name) === item.ingredientName &&
        canSubtract(item.unit, inv.unit),
    );
    if (!matchingInventory) return true;

    const net = netNeeded(item.quantity, item.unit, matchingInventory.quantity, matchingInventory.unit);
    if (net === null) return true;

    item.quantity = net.netQty;
    item.unit = net.netUnit;
    return net.netQty > 0;
  });
}

// ——— shared ———

function sortByCategory(items: IGroceryListItem[]): void {
  const categoryOrder = new Map(GROCERY_CATEGORIES.map((c, i) => [c, i]));
  items.sort((a, b) => {
    const catA = categoryOrder.get(a.category as GroceryCategory) ?? 999;
    const catB = categoryOrder.get(b.category as GroceryCategory) ?? 999;
    if (catA !== catB) return catA - catB;
    return a.displayName.localeCompare(b.displayName);
  });
}

function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}
