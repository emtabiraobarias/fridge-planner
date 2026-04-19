import { describe, it, expect } from '@jest/globals';
import { generateGroceryList } from '../../src/lib/grocery-list-generator.js';
import type { IMealPlan } from '../../src/types/meal-plan.js';
import type { IInventoryItem } from '../../src/models/inventory-item.js';

function makePlan(missingIngredients: string[][], mealNames?: string[]): IMealPlan {
  return {
    userId: 'user-1',
    weekStart: new Date('2026-04-06'),
    entries: missingIngredients.map((missing, i) => ({
      slotId: `slot-${i}`,
      date: new Date('2026-04-06'),
      mealType: 'dinner',
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
