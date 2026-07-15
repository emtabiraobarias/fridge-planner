import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecommendationsProvider, useRecommendations } from '../../src/context/RecommendationsContext';
import type { MealRecommendation } from '../../src/types/meal-recommendation';

const { fetchRecipeLinks } = vi.hoisted(() => ({ fetchRecipeLinks: vi.fn() }));
vi.mock('../../src/services/inventory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/inventory')>()),
  fetchRecipeLinks,
}));

const meal = (name: string): MealRecommendation => ({
  mealName: name,
  suggestedMealType: 'dinner',
  prepTimeMinutes: 20,
  cuisine: 'Asian',
  description: 'desc',
  usesIngredients: [],
  expiringIngredients: [],
  missingIngredients: [],
});

/** Harness exposing the context to the test via buttons + readouts. */
function Harness({ fresh }: { fresh: MealRecommendation[] }): React.JSX.Element {
  const { meals, error, linksPending, setMeals, checkLinks } = useRecommendations();
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setMeals(fresh);
          void checkLinks(fresh);
        }}
      >
        load
      </button>
      <output aria-label="pending">{String(linksPending)}</output>
      <output aria-label="error">{error}</output>
      <ul>
        {meals.map((m) => (
          <li key={m.mealName}>
            {m.mealName}
            {m.recipeUrl ? ` → ${m.recipeUrl}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderHarness(fresh: MealRecommendation[]): void {
  render(
    <RecommendationsProvider>
      <Harness fresh={fresh} />
    </RecommendationsProvider>,
  );
}

beforeEach(() => {
  fetchRecipeLinks.mockReset();
});

describe('RecommendationsContext.checkLinks (FR-037 lazy phase)', () => {
  it('attaches verified links and removes still-unlinked meals when done', async () => {
    fetchRecipeLinks.mockResolvedValueOnce({
      available: true,
      links: { Adobo: { recipeUrl: 'https://panlasangpinoy.com/adobo/' } },
    });
    renderHarness([meal('Adobo'), meal('Mystery Stew')]);

    await userEvent.click(screen.getByRole('button', { name: 'load' }));

    await waitFor(() => {
      expect(screen.getByText(/Adobo → https:\/\/panlasangpinoy.com\/adobo\//)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Mystery Stew/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('pending')).toHaveTextContent('false');
    expect(fetchRecipeLinks).toHaveBeenCalledWith(['Adobo', 'Mystery Stew']);
  });

  it('clears the list and surfaces a notice when verification is unavailable', async () => {
    fetchRecipeLinks.mockResolvedValueOnce({ available: false, links: {} });
    renderHarness([meal('Adobo')]);

    await userEvent.click(screen.getByRole('button', { name: 'load' }));

    await waitFor(() => {
      expect(screen.getByLabelText('error')).toHaveTextContent(/verification unavailable/i);
    });
    expect(screen.queryByText(/Adobo/)).not.toBeInTheDocument();
  });

  it('surfaces a notice when no meal could be verified', async () => {
    fetchRecipeLinks.mockResolvedValueOnce({ available: true, links: {} });
    renderHarness([meal('Adobo')]);

    await userEvent.click(screen.getByRole('button', { name: 'load' }));

    await waitFor(() => {
      expect(screen.getByLabelText('error')).toHaveTextContent(/no recipe link could be verified/i);
    });
  });

  it('treats a failed lazy request as unavailability (never leaves unlinked meals up)', async () => {
    fetchRecipeLinks.mockRejectedValueOnce(new Error('network down'));
    renderHarness([meal('Adobo')]);

    await userEvent.click(screen.getByRole('button', { name: 'load' }));

    await waitFor(() => {
      expect(screen.getByLabelText('error')).toHaveTextContent(/verification unavailable/i);
    });
    expect(screen.queryByText(/Adobo/)).not.toBeInTheDocument();
  });

  it('skips the lazy phase entirely when every meal already has a link (fallback sets)', async () => {
    const linked = { ...meal('Adobo'), recipeUrl: 'https://panlasangpinoy.com/adobo/' };
    renderHarness([linked]);

    await userEvent.click(screen.getByRole('button', { name: 'load' }));

    expect(fetchRecipeLinks).not.toHaveBeenCalled();
    expect(screen.getByText(/Adobo → /)).toBeInTheDocument();
  });
});
