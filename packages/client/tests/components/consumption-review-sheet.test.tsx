import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConsumptionReviewSheet } from '../../src/components/calendar/ConsumptionReviewSheet';
import { buildReviewLines } from '../../src/lib/consumption-review';
import type { MealRecommendation } from '../../src/types/meal-recommendation';
import type { InventoryItem } from '../../src/services/inventory';

const meal: MealRecommendation = {
  mealName: 'Chicken Adobo',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 25,
  cuisine: 'Filipino',
  description: 'Braised chicken.',
  usesIngredients: ['Chicken Thighs', 'Onion'],
  expiringIngredients: [],
  missingIngredients: ['Soy Sauce'],
  groundedIngredients: [
    { inventoryItemId: 'i1', name: 'Chicken Thighs', quantityToConsume: 500, unit: 'g', resolution: 'direct' },
    { inventoryItemId: 'i2', name: 'Onion', resolution: 'fuzzy' },
    { name: 'Galangal', resolution: 'unresolved' },
  ],
};

function inv(id: string, name: string, quantity: number, unit: string): InventoryItem {
  return {
    _id: id,
    userId: 'u',
    name,
    quantity,
    unit,
    category: 'Meat',
    location: 'fridge',
    expirationStatus: 'normal',
  } as InventoryItem;
}

describe('buildReviewLines (spec 006 FR-MC-009)', () => {
  it('pre-fills grounded amounts, one unit for unquantified matches, and lists unresolved separately', () => {
    const { lines, unresolved } = buildReviewLines(meal, [
      inv('i1', 'Chicken Thighs', 1000, 'g'),
      inv('i2', 'Onion', 3, 'count'),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ inventoryItemId: 'i1', name: 'Chicken Thighs', quantity: 500, unit: 'g' });
    expect(lines[1]).toMatchObject({ inventoryItemId: 'i2', name: 'Onion', quantity: 1, unit: 'count' });
    expect(unresolved).toEqual(['Galangal']);
  });

  it('clamps the pre-fill to current owned stock when inventory drifted (spec US2-S5)', () => {
    const { lines } = buildReviewLines(meal, [inv('i1', 'Chicken Thighs', 300, 'g')]);
    expect(lines[0]!.quantity).toBe(300);
  });

  it('falls back to name-matched one-unit lines for a legacy meal without grounding', () => {
    const legacy = { ...meal };
    delete (legacy as Partial<MealRecommendation>).groundedIngredients;
    const { lines, unresolved } = buildReviewLines(legacy, [inv('i1', 'Chicken Thighs', 1000, 'g')]);
    expect(lines.find((l) => l.name === 'Chicken Thighs')).toMatchObject({ quantity: 1, unit: 'g' });
    // an unmatched legacy name is surfaced read-only, not silently dropped (FR-MC-009)
    expect(unresolved).toContain('Onion');
  });
});

describe('ConsumptionReviewSheet (spec 006 FR-MC-009)', () => {
  const lines = [
    { inventoryItemId: 'i1', name: 'Chicken Thighs', quantity: 500, unit: 'g' },
    { inventoryItemId: 'i2', name: 'Onion', quantity: 1, unit: 'count' },
  ];

  it('renders one adjustable row per resolved ingredient with the assumed amount pre-filled', () => {
    render(
      <ConsumptionReviewSheet
        mealName="Chicken Adobo"
        lines={lines}
        unresolvedNames={['Galangal']}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Chicken Thighs amount')).toHaveValue(500);
    expect(screen.getByLabelText('Onion amount')).toHaveValue(1);
    // unresolved ingredients are read-only — no input
    expect(screen.getByText(/Galangal/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Galangal amount')).not.toBeInTheDocument();
  });

  it('submits adjusted amounts, including zero for "did not use it"', () => {
    const onConfirm = vi.fn();
    render(
      <ConsumptionReviewSheet
        mealName="Chicken Adobo"
        lines={lines}
        unresolvedNames={[]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Chicken Thighs amount'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Onion amount'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledWith([
      { inventoryItemId: 'i1', name: 'Chicken Thighs', quantity: 300, unit: 'g' },
      { inventoryItemId: 'i2', name: 'Onion', quantity: 0, unit: 'count' },
    ]);
  });

  it('cancel never confirms', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConsumptionReviewSheet
        mealName="Chicken Adobo"
        lines={lines}
        unresolvedNames={[]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
