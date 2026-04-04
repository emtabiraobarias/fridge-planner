import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MealCard } from '../../src/components/recommendations/MealCard';
import type { MealRecommendation } from '../../src/types/meal-recommendation';

const baseMeal: MealRecommendation = {
  mealName: 'Spinach Omelette',
  suggestedMealType: 'breakfast',
  prepTimeMinutes: 10,
  cuisine: 'French',
  description: 'A light omelette packed with spinach.',
  usesIngredients: ['egg', 'spinach', 'butter'],
  expiringIngredients: ['spinach'],
  missingIngredients: ['chives'],
};

describe('MealCard', () => {
  it('renders the meal name', () => {
    render(<ul><MealCard meal={baseMeal} /></ul>);
    expect(screen.getByText('Spinach Omelette')).toBeInTheDocument();
  });

  it('renders cuisine badge', () => {
    render(<ul><MealCard meal={baseMeal} /></ul>);
    expect(screen.getByText('French')).toBeInTheDocument();
  });

  it('renders the suggested meal type badge', () => {
    render(<ul><MealCard meal={baseMeal} /></ul>);
    expect(screen.getByText('Breakfast')).toBeInTheDocument();
  });

  it('renders prep time', () => {
    render(<ul><MealCard meal={baseMeal} /></ul>);
    expect(screen.getByText(/10 min/)).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<ul><MealCard meal={baseMeal} /></ul>);
    expect(screen.getByText('A light omelette packed with spinach.')).toBeInTheDocument();
  });

  it('renders expiring ingredient with ⚠️ prefix', () => {
    render(<ul><MealCard meal={baseMeal} /></ul>);
    expect(screen.getByText(/⚠️.*spinach/i)).toBeInTheDocument();
  });

  it('renders non-expiring used ingredients without warning', () => {
    render(<ul><MealCard meal={baseMeal} /></ul>);
    expect(screen.getByText('egg')).toBeInTheDocument();
    expect(screen.getByText('butter')).toBeInTheDocument();
  });

  it('renders missing ingredients with "Need:" prefix', () => {
    render(<ul><MealCard meal={baseMeal} /></ul>);
    expect(screen.getByText(/need:.*chives/i)).toBeInTheDocument();
  });

  it('renders nothing in missing section when no missing ingredients', () => {
    const meal = { ...baseMeal, missingIngredients: [] };
    render(<ul><MealCard meal={meal} /></ul>);
    expect(screen.queryByText(/need:/i)).not.toBeInTheDocument();
  });

  it('renders correct meal type label for dinner', () => {
    const meal = { ...baseMeal, suggestedMealType: 'dinner' as const };
    render(<ul><MealCard meal={meal} /></ul>);
    expect(screen.getByText('Dinner')).toBeInTheDocument();
  });
});
