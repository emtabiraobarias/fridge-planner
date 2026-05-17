import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { DraggableMealCard } from '../../../src/components/recommendations/DraggableMealCard';
import type { MealRecommendation } from '../../../src/types/meal-recommendation';

const mockMeal: MealRecommendation = {
  mealName: 'Grilled Salmon',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 30,
  cuisine: 'Mediterranean',
  description: 'Healthy grilled salmon.',
  usesIngredients: ['salmon'],
  expiringIngredients: ['salmon'],
  missingIngredients: [],
};

describe('DraggableMealCard', () => {
  it('renders the meal card within a DndContext', () => {
    render(
      <DndContext>
        <DraggableMealCard meal={mockMeal} index={0} />
      </DndContext>,
    );
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument();
  });
});
