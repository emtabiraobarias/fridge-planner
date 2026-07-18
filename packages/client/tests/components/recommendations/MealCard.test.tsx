import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MealCard } from '../../../src/components/recommendations/MealCard';
import type { MealRecommendation } from '../../../src/types/meal-recommendation';

const baseMeal: MealRecommendation = {
  mealName: 'Chicken Adobo',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 25,
  cuisine: 'Filipino',
  description: 'Braised chicken.',
  usesIngredients: ['Chicken Thighs', 'Onion'],
  expiringIngredients: ['Chicken Thighs'],
  missingIngredients: ['Soy Sauce'],
};

describe('MealCard grounded amounts (spec 006 US1, FR-MC-001)', () => {
  it('shows the grounded amount beside a quantified ingredient', () => {
    render(
      <MealCard
        meal={{
          ...baseMeal,
          groundedIngredients: [
            {
              inventoryItemId: 'abc',
              name: 'Chicken Thighs',
              quantityToConsume: 500,
              unit: 'g',
              resolution: 'direct',
            },
            { inventoryItemId: 'def', name: 'Onion', resolution: 'fuzzy' },
          ],
        }}
      />,
    );
    expect(screen.getByText(/Chicken Thighs · 500 g/)).toBeInTheDocument();
    // unquantified match renders as the bare name
    expect(screen.getByText('Onion')).toBeInTheDocument();
  });

  it('renders plain names for ungrounded (fallback/legacy) meals', () => {
    render(<MealCard meal={baseMeal} />);
    expect(screen.getByText('Chicken Thighs — use soon')).toBeInTheDocument();
    expect(screen.queryByText(/Chicken Thighs · /)).not.toBeInTheDocument();
  });
});
