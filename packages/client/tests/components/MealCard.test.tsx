import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
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

describe('MealCard (organic)', () => {
  it('renders the meal name', () => {
    render(
      <ul>
        <MealCard meal={baseMeal} />
      </ul>,
    );
    expect(screen.getByText('Spinach Omelette')).toBeInTheDocument();
  });

  it('renders a cuisine · type · time meta line', () => {
    render(
      <ul>
        <MealCard meal={baseMeal} />
      </ul>,
    );
    expect(screen.getByText(/French · Breakfast · 10 min/)).toBeInTheDocument();
  });

  it('renders the description', () => {
    render(
      <ul>
        <MealCard meal={baseMeal} />
      </ul>,
    );
    expect(screen.getByText('A light omelette packed with spinach.')).toBeInTheDocument();
  });

  it('marks expiring ingredients "use soon"', () => {
    render(
      <ul>
        <MealCard meal={baseMeal} />
      </ul>,
    );
    expect(screen.getByText(/spinach — use soon/i)).toBeInTheDocument();
  });

  it('renders non-expiring used ingredients plainly', () => {
    render(
      <ul>
        <MealCard meal={baseMeal} />
      </ul>,
    );
    expect(screen.getByText('egg')).toBeInTheDocument();
    expect(screen.getByText('butter')).toBeInTheDocument();
  });

  it('prefixes missing ingredients with "need"', () => {
    render(
      <ul>
        <MealCard meal={baseMeal} />
      </ul>,
    );
    expect(screen.getByText(/need chives/i)).toBeInTheDocument();
  });

  it('omits the missing section when there are none', () => {
    render(
      <ul>
        <MealCard meal={{ ...baseMeal, missingIngredients: [] }} />
      </ul>,
    );
    expect(screen.queryByText(/need /i)).not.toBeInTheDocument();
  });

  it('renders "Plan it" only when onPlan is provided, and calls it', async () => {
    const onPlan = vi.fn();
    const { rerender } = render(
      <ul>
        <MealCard meal={baseMeal} />
      </ul>,
    );
    expect(screen.queryByRole('button', { name: /plan it/i })).not.toBeInTheDocument();
    rerender(
      <ul>
        <MealCard meal={baseMeal} onPlan={onPlan} />
      </ul>,
    );
    await userEvent.click(screen.getByRole('button', { name: /plan it/i }));
    expect(onPlan).toHaveBeenCalledWith(baseMeal);
  });

  it('renders a recipe link opening in a new tab when recipeUrl is present (FR-015/FR-037)', () => {
    render(
      <ul>
        <MealCard meal={{ ...baseMeal, recipeUrl: 'https://www.recipetineats.com/omelette/' }} />
      </ul>,
    );
    const link = screen.getByRole('link', { name: /view recipe/i });
    expect(link).toHaveAttribute('href', 'https://www.recipetineats.com/omelette/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders no recipe link when recipeUrl is absent', () => {
    render(
      <ul>
        <MealCard meal={baseMeal} />
      </ul>,
    );
    expect(screen.queryByRole('link', { name: /view recipe/i })).not.toBeInTheDocument();
  });
});
