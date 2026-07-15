import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuggestionsRail } from '../../../src/components/calendar/SuggestionsRail';
import { RecommendationsProvider } from '../../../src/context/RecommendationsContext';
import { PlacementProvider } from '../../../src/context/PlacementContext';
import type { MealRecommendation } from '../../../src/types/meal-recommendation';

const { fetchRecommendations } = vi.hoisted(() => ({ fetchRecommendations: vi.fn() }));
vi.mock('../../../src/services/inventory', () => ({ fetchRecommendations }));

const linkedMeal: MealRecommendation = {
  mealName: 'Chicken Adobo',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 45,
  cuisine: 'Filipino',
  description: 'Classic braised chicken.',
  usesIngredients: ['chicken'],
  expiringIngredients: ['chicken'],
  missingIngredients: [],
  recipeUrl: 'https://panlasangpinoy.com/filipino-chicken-adobo-recipe/',
};

function renderRail(): void {
  render(
    <RecommendationsProvider>
      <PlacementProvider>
        <SuggestionsRail />
      </PlacementProvider>
    </RecommendationsProvider>,
  );
}

beforeEach(() => {
  fetchRecommendations.mockReset();
});

describe('SuggestionsRail', () => {
  it('renders each suggestion with a recipe link opening in a new tab (FR-015/FR-037)', async () => {
    fetchRecommendations.mockResolvedValueOnce({ recommendations: [linkedMeal] });
    renderRail();

    await userEvent.click(screen.getByRole('button', { name: /get suggestions/i }));

    const link = await screen.findByRole('link', { name: /view recipe/i });
    expect(link).toHaveAttribute('href', 'https://panlasangpinoy.com/filipino-chicken-adobo-recipe/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('renders no recipe link for a meal without recipeUrl', async () => {
    const { recipeUrl: _drop, ...unlinked } = linkedMeal;
    fetchRecommendations.mockResolvedValueOnce({ recommendations: [unlinked] });
    renderRail();

    await userEvent.click(screen.getByRole('button', { name: /get suggestions/i }));

    expect(await screen.findByText('Chicken Adobo')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view recipe/i })).not.toBeInTheDocument();
  });
});
