import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuggestionsRail } from '../../../src/components/calendar/SuggestionsRail';
import { RecommendationsProvider } from '../../../src/context/RecommendationsContext';
import { PlacementProvider } from '../../../src/context/PlacementContext';
import type { MealRecommendation } from '../../../src/types/meal-recommendation';

const { fetchRecommendations, fetchRecipeLinks } = vi.hoisted(() => ({
  fetchRecommendations: vi.fn(),
  fetchRecipeLinks: vi.fn(),
}));
vi.mock('../../../src/services/inventory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/services/inventory')>()),
  fetchRecommendations,
  fetchRecipeLinks,
}));

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
  fetchRecipeLinks.mockReset();
  // Default: verify everything (no removal). Lazy-phase tests override per-case.
  fetchRecipeLinks.mockImplementation((names: string[]) =>
    Promise.resolve({
      available: true,
      links: Object.fromEntries(names.map((n) => [n, { recipeUrl: `https://example.test/${encodeURIComponent(n)}` }])),
    }),
  );
});

describe('SuggestionsRail', () => {
  it('mounting alone triggers zero fetchRecommendations calls (spec 009 IR1 — already manual-trigger, regression lock)', () => {
    renderRail();
    expect(fetchRecommendations).not.toHaveBeenCalled();
  });

  it('renders each suggestion with a recipe link opening in a new tab (FR-015/FR-037)', async () => {
    fetchRecommendations.mockResolvedValueOnce({ recommendations: [linkedMeal] });
    renderRail();

    await userEvent.click(screen.getByRole('button', { name: /get suggestions/i }));

    const link = await screen.findByRole('link', { name: /view recipe/i });
    expect(link).toHaveAttribute('href', 'https://panlasangpinoy.com/filipino-chicken-adobo-recipe/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('surfaces the server Problem JSON detail when the fetch fails (FR-037 503)', async () => {
    fetchRecommendations.mockRejectedValueOnce(
      new Error('Recipe-link verification is not configured (BRAVE_SEARCH_API_KEY / SPOONACULAR_API_KEY unset), so no recommendation can carry the required recipe link.'),
    );
    renderRail();

    await userEvent.click(screen.getByRole('button', { name: /get suggestions/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/verification is not configured/i);
  });

  it('removes meals whose link cannot be verified once the lazy phase completes (FR-037)', async () => {
    const { recipeUrl: _drop, ...unlinked } = linkedMeal;
    fetchRecommendations.mockResolvedValueOnce({
      recommendations: [unlinked, { ...unlinked, mealName: 'Verifiable Curry' }],
    });
    fetchRecipeLinks.mockResolvedValueOnce({
      available: true,
      links: { 'Verifiable Curry': { recipeUrl: 'https://www.recipetineats.com/curry/' } },
    });
    renderRail();

    await userEvent.click(screen.getByRole('button', { name: /get suggestions/i }));

    expect(await screen.findByText('Verifiable Curry')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Chicken Adobo')).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: /view recipe/i })).toHaveAttribute(
      'href',
      'https://www.recipetineats.com/curry/',
    );
  });
});
