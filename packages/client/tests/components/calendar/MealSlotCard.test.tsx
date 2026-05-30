import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MealSlotCard } from '../../../src/components/calendar/MealSlotCard';
import type { MealRecommendation } from '../../../src/types/meal-recommendation';

const mockMeal: MealRecommendation = {
  mealName: 'Pasta Primavera',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 25,
  cuisine: 'Italian',
  description: 'Light pasta with vegetables.',
  usesIngredients: ['pasta', 'zucchini'],
  expiringIngredients: [],
  missingIngredients: [],
};

describe('MealSlotCard', () => {
  it('renders the meal name', () => {
    render(<MealSlotCard meal={mockMeal} />);
    expect(screen.getByText('Pasta Primavera')).toBeInTheDocument();
  });

  it('renders cuisine and prep time', () => {
    render(<MealSlotCard meal={mockMeal} />);
    expect(screen.getByText('Italian')).toBeInTheDocument();
    expect(screen.getByText(/25 min/)).toBeInTheDocument();
  });
});
