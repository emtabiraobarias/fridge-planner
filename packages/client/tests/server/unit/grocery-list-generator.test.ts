import { describe, it, expect } from 'vitest';
import { generateGroceryList } from '@server/lib/grocery-list-generator';
import type { IMealPlan } from '@server/types/meal-plan';
import type { IInventoryItem } from '@server/models/inventory-item';

function makePlan(missingIngredients: string[][], mealNames?: string[]): IMealPlan {
  return {
    userId: 'user-1',
    weekStart: new Date('2026-04-06'),
    entries: missingIngredients.map((missing, i) => ({
      slotId: `slot-${i}`,
      date: new Date('2026-04-06'),
      mealType: 'dinner',
      status: 'planned', // spec 006: only planned entries generate needs (FR-MC-016)
      meal: {
        mealName: mealNames?.[i] ?? `Meal ${i + 1}`,
        suggestedMealType: 'dinner',
        prepTimeMinutes: 20,
        cuisine: 'Test',
        description: '',
        usesIngredients: [],
        expiringIngredients: [],
        missingIngredients: missing,
      },
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeInventoryItem(
  name: string,
  quantity: number,
  unit: string,
): IInventoryItem {
  return {
    userId: 'user-1',
    name,
    quantity,
    unit,
    category: 'Other',
    location: 'fridge',
    expirationStatus: 'normal',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as IInventoryItem;
}

describe('generateGroceryList', () => {
  it('returns empty items for a plan with no missing ingredients', () => {
    const plan = makePlan([[], []]);
    const result = generateGroceryList(plan, []);
    expect(result.items).toHaveLength(0);
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('aggregates same ingredient across 3 meals (FR-026)', () => {
    const plan = makePlan(
      [['onion'], ['onion'], ['onion']],
      ['Meal A', 'Meal B', 'Meal C'],
    );
    const result = generateGroceryList(plan, []);

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item!.ingredientName).toBe('onion');
    expect(item!.quantity).toBe(3);
    expect(item!.unit).toBe('servings');
    expect(item!.sourceMealNames).toEqual(['Meal A', 'Meal B', 'Meal C']);
  });

  it('groups plural and singular into one item', () => {
    const plan = makePlan([['onion'], ['Onions']]);
    const result = generateGroceryList(plan, []);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.quantity).toBe(2);
  });

  it('keeps distinct ingredients separate', () => {
    const plan = makePlan([['garlic', 'ginger', 'onion']]);
    const result = generateGroceryList(plan, []);
    expect(result.items).toHaveLength(3);
  });

  it('keeps item when inventory units are incompatible with servings (FR-027 future)', () => {
    // Auto-generated items use unit='servings', inventory has real units —
    // canSubtract('servings', 'count') = false, so item is NOT dropped
    const plan = makePlan([['eggs'], ['eggs']]);
    const inventory = [makeInventoryItem('eggs', 5, 'count')];
    const result = generateGroceryList(plan, inventory);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.unit).toBe('servings');
  });

  it('sets isPurchased false and isManuallyAdded false on generated items', () => {
    const plan = makePlan([['garlic']]);
    const result = generateGroceryList(plan, []);
    expect(result.items[0]!.isPurchased).toBe(false);
    expect(result.items[0]!.isManuallyAdded).toBe(false);
  });

  it('infers category for items', () => {
    const plan = makePlan([['garlic']]);
    const result = generateGroceryList(plan, []);
    expect(result.items[0]!.category).toBe('Produce');
  });

  it('sorts items by category order then alphabetically', () => {
    // Produce before Dairy before Meat
    const plan = makePlan([['chicken', 'milk', 'garlic']]);
    const result = generateGroceryList(plan, []);
    const categories = result.items.map((i) => i.category);
    expect(categories.indexOf('Produce')).toBeLessThan(categories.indexOf('Dairy'));
    expect(categories.indexOf('Dairy')).toBeLessThan(categories.indexOf('Meat'));
  });

  it('deduplicates source meal names', () => {
    // Same meal name appears twice but should only appear once in sourceMealNames
    const plan = makePlan([['onion'], ['onion']], ['Pasta', 'Pasta']);
    const result = generateGroceryList(plan, []);
    expect(result.items[0]!.sourceMealNames).toEqual(['Pasta']);
  });

  it('handles empty entries array', () => {
    const plan: IMealPlan = {
      userId: 'user-1',
      weekStart: new Date(),
      entries: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = generateGroceryList(plan, []);
    expect(result.items).toHaveLength(0);
  });
});

// ——— Spec 006 US4: quantity-aware generation (FR-MC-016..019) ———

import type { IMealPlanEntry } from '@server/types/meal-plan';
import type { GroundedIngredient } from '@server/types/meal-recommendation';

interface GroundedMealSpec {
  grounded: GroundedIngredient[];
  missing?: string[];
  status?: 'planned' | 'cooked' | undefined;
  legacy?: boolean; // no status field at all
  mealName?: string;
}

function makeGroundedPlan(meals: GroundedMealSpec[]): IMealPlan {
  return {
    userId: 'user-1',
    weekStart: new Date('2026-04-06'),
    entries: meals.map((m, i): IMealPlanEntry => {
      const entry: IMealPlanEntry = {
        slotId: `slot-${i}`,
        date: new Date('2026-04-06'),
        mealType: 'dinner',
        meal: {
          mealName: m.mealName ?? `Meal ${i + 1}`,
          suggestedMealType: 'dinner',
          prepTimeMinutes: 20,
          cuisine: 'Test',
          description: '',
          usesIngredients: m.grounded.map((g) => g.name),
          expiringIngredients: [],
          missingIngredients: m.missing ?? [],
          groundedIngredients: m.grounded,
        },
      };
      if (!m.legacy) entry.status = m.status ?? 'planned';
      return entry;
    }),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function g(name: string, quantityToConsume: number, unit: string): GroundedIngredient {
  return { inventoryItemId: `id-${name}`, name, quantityToConsume, unit, resolution: 'direct' };
}

describe('generateGroceryList — grounded quantities (spec 006 US4)', () => {
  it('nets summed grounded need against owned stock and lists the shortfall (FR-MC-016)', () => {
    const plan = makeGroundedPlan([
      { grounded: [g('mince', 200, 'g')], mealName: 'Tacos' },
      { grounded: [g('mince', 300, 'g')], mealName: 'Bolognese' },
    ]);
    const result = generateGroceryList(plan, [makeInventoryItem('mince', 400, 'g')]);
    const line = result.items.find((i) => i.ingredientName === 'mince')!;
    expect(line.quantity).toBe(100);
    expect(line.unit).toBe('g');
    expect(line.sourceMealNames.sort()).toEqual(['Bolognese', 'Tacos']);
  });

  it('omits an ingredient whose need is fully covered (FR-MC-016)', () => {
    const plan = makeGroundedPlan([{ grounded: [g('mince', 200, 'g')] }]);
    const result = generateGroceryList(plan, [makeInventoryItem('mince', 400, 'g')]);
    expect(result.items.find((i) => i.ingredientName === 'mince')).toBeUndefined();
  });

  it('sums compatible units in one canonical unit (1 kg + 500 g → 1.5 kg worth) (FR-MC-017)', () => {
    const plan = makeGroundedPlan([
      { grounded: [g('flour', 1, 'kg')] },
      { grounded: [g('flour', 500, 'g')] },
    ]);
    const result = generateGroceryList(plan, [makeInventoryItem('flour', 200, 'g')]);
    const line = result.items.find((i) => i.ingredientName === 'flour')!;
    expect(line.quantity).toBe(1300);
    expect(line.unit).toBe('g');
  });

  it('falls back to the servings count when one name mixes incompatible unit families (FR-MC-017)', () => {
    const plan = makeGroundedPlan([
      { grounded: [g('stock', 500, 'ml')], mealName: 'Soup' },
      { grounded: [g('stock', 2, 'count')], mealName: 'Risotto' },
    ]);
    const result = generateGroceryList(plan, []);
    const line = result.items.find((i) => i.ingredientName === 'stock')!;
    expect(line.unit).toBe('servings');
    expect(line.quantity).toBe(2); // number of meals needing it
  });

  it('mixes grounded real-amount lines with servings lines from missing ingredients (FR-MC-017)', () => {
    const plan = makeGroundedPlan([
      { grounded: [g('mince', 500, 'g')], missing: ['soy sauce'] },
    ]);
    const result = generateGroceryList(plan, [makeInventoryItem('mince', 100, 'g')]);
    const mince = result.items.find((i) => i.ingredientName === 'mince')!;
    const soy = result.items.find((i) => i.ingredientName === 'soy sauce')!;
    expect(mince.unit).toBe('g');
    expect(mince.quantity).toBe(400);
    expect(soy.unit).toBe('servings');
    expect(soy.quantity).toBe(1);
  });

  it('excludes cooked and legacy (no-status) entries from need computation (FR-MC-016, research D9)', () => {
    const plan = makeGroundedPlan([
      { grounded: [g('mince', 200, 'g')], missing: ['soy sauce'], status: 'cooked' },
      { grounded: [g('mince', 300, 'g')], missing: ['vinegar'], legacy: true },
      { grounded: [g('mince', 100, 'g')], missing: ['garlic'] }, // planned
    ]);
    const result = generateGroceryList(plan, []);
    const mince = result.items.find((i) => i.ingredientName === 'mince')!;
    expect(mince.quantity).toBe(100); // only the planned meal counts
    expect(result.items.find((i) => i.ingredientName === 'soy sauce')).toBeUndefined();
    expect(result.items.find((i) => i.ingredientName === 'vinegar')).toBeUndefined();
    expect(result.items.find((i) => i.ingredientName === 'garlic')).toBeDefined();
  });

  it('ignores unresolved/unquantified grounded entries in the amount pass (they ride the servings path)', () => {
    const plan = makeGroundedPlan([
      {
        grounded: [
          { name: 'galangal', resolution: 'unresolved' },
          { inventoryItemId: 'id-onion', name: 'onion', resolution: 'fuzzy' }, // no amount
        ],
        missing: ['galangal'],
      },
    ]);
    const result = generateGroceryList(plan, []);
    const galangal = result.items.find((i) => i.ingredientName === 'galangal')!;
    expect(galangal.unit).toBe('servings');
    // onion has no usable amount and isn't missing → not a purchase line
    expect(result.items.find((i) => i.ingredientName === 'onion')).toBeUndefined();
  });
});

// ——— Spec 008 US1: date-scoped generation (FR-RG-001/003, T009) ———

const AS_OF = new Date('2026-07-15T00:00:00.000Z');
const YESTERDAY = new Date('2026-07-14T00:00:00.000Z');
const TOMORROW = new Date('2026-07-16T00:00:00.000Z');

interface DatedMealSpec {
  date: Date;
  missing?: string[];
  grounded?: GroundedIngredient[];
  status?: 'planned' | 'cooked';
  mealName?: string;
}

function makeDatedPlan(meals: DatedMealSpec[]): IMealPlan {
  return {
    userId: 'user-1',
    weekStart: new Date('2026-07-13'),
    entries: meals.map((m, i): IMealPlanEntry => ({
      slotId: `slot-${i}`,
      date: m.date,
      mealType: 'dinner',
      status: m.status ?? 'planned',
      meal: {
        mealName: m.mealName ?? `Meal ${i + 1}`,
        suggestedMealType: 'dinner',
        prepTimeMinutes: 20,
        cuisine: 'Test',
        description: '',
        usesIngredients: (m.grounded ?? []).map((x) => x.name),
        expiringIngredients: [],
        missingIngredients: m.missing ?? [],
        ...(m.grounded ? { groundedIngredients: m.grounded } : {}),
      },
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('generateGroceryList — date scope (spec 008 US1)', () => {
  it('excludes a planned entry dated before asOf (FR-RG-001)', () => {
    const plan = makeDatedPlan([
      { date: YESTERDAY, missing: ['soy sauce'], mealName: 'Past Dinner' },
      { date: TOMORROW, missing: ['soy sauce'], mealName: 'Future Dinner' },
    ]);
    const result = generateGroceryList(plan, [], AS_OF);
    const soy = result.items.find((i) => i.ingredientName === 'soy sauce')!;
    expect(soy.quantity).toBe(1); // only the tomorrow meal counts
    expect(soy.sourceMealNames).toEqual(['Future Dinner']);
  });

  it('contributes nothing from a cooked entry dated yesterday (FR-RG-001)', () => {
    const plan = makeDatedPlan([
      { date: YESTERDAY, status: 'cooked', grounded: [g('mince', 200, 'g')] },
    ]);
    const result = generateGroceryList(plan, [], AS_OF);
    expect(result.items.find((i) => i.ingredientName === 'mince')).toBeUndefined();
  });

  it('sums the servings-fallback count over only in-scope meals (FR-RG-003)', () => {
    const plan = makeDatedPlan([
      { date: YESTERDAY, missing: ['onion'], mealName: 'A' },
      { date: TOMORROW, missing: ['onion'], mealName: 'B' },
      { date: TOMORROW, missing: ['onion'], mealName: 'C' },
    ]);
    const result = generateGroceryList(plan, [], AS_OF);
    const onion = result.items.find((i) => i.ingredientName === 'onion')!;
    expect(onion.quantity).toBe(2); // B + C only, not the past A
    expect(onion.sourceMealNames.sort()).toEqual(['B', 'C']);
  });

  it('nets a since-shed prior-day purchase off the recomputed need so nothing is re-listed (FR-RG-011)', () => {
    const plan = makeDatedPlan([{ date: TOMORROW, grounded: [g('mince', 200, 'g')] }]);
    // Stock a prior-day (now-shed) purchase left in the kitchen fully covers tomorrow's need.
    const result = generateGroceryList(plan, [makeInventoryItem('mince', 300, 'g')], AS_OF);
    expect(result.items.find((i) => i.ingredientName === 'mince')).toBeUndefined();
  });

  it('leaves behaviour unchanged when asOf is omitted (007 lazy path)', () => {
    const plan = makeDatedPlan([{ date: YESTERDAY, missing: ['soy sauce'] }]);
    const result = generateGroceryList(plan, []); // no asOf → no date filter
    expect(result.items.find((i) => i.ingredientName === 'soy sauce')).toBeDefined();
  });
});
