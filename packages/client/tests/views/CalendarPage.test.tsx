import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CalendarPage } from '../../src/views/CalendarPage';
import { MealPlanProvider } from '../../src/context/MealPlanContext';
import { RecommendationsProvider } from '../../src/context/RecommendationsContext';
import { PlacementProvider, usePlacement } from '../../src/context/PlacementContext';
import { ToastProvider } from '../../src/context/ToastContext';
import { Toast } from '../../src/components/shared/Toast';
import type { MealRecommendation } from '../../src/types/meal-recommendation';
import * as weekUtils from '../../src/lib/date-utils';

const addEntry = vi.fn().mockResolvedValue({});
const removeEntry = vi.fn().mockResolvedValue({});
const fetchMealPlan = vi.fn().mockResolvedValue(null);

vi.mock('../../src/services/meal-plans', () => ({
  fetchMealPlan: (...a: unknown[]) => fetchMealPlan(...a),
  addEntry: (...a: unknown[]) => addEntry(...a),
  removeEntry: (...a: unknown[]) => removeEntry(...a),
  replaceEntries: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/services/inventory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/inventory')>()),
  fetchRecommendations: vi.fn().mockResolvedValue({ recommendations: [] }),
}));

const meal: MealRecommendation = {
  mealName: 'Thai Green Curry',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 35,
  cuisine: 'Thai',
  description: 'Fragrant curry.',
  usesIngredients: [],
  expiringIngredients: [],
  missingIngredients: [],
};

// Test harness that seeds a meal into placement mode before rendering the page.
function Primed(): React.JSX.Element {
  const { startPlacing } = usePlacement();
  return (
    <>
      <button type="button" onClick={() => startPlacing(meal)}>
        prime
      </button>
      <CalendarPage />
    </>
  );
}

function renderPage(): ReturnType<typeof render> {
  return render(
    <ToastProvider>
      <MealPlanProvider>
        <RecommendationsProvider>
          <PlacementProvider>
            <Primed />
            <Toast />
          </PlacementProvider>
        </RecommendationsProvider>
      </MealPlanProvider>
    </ToastProvider>,
  );
}

describe('CalendarPage tap-to-place', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMealPlan.mockResolvedValue(null);
  });

  it('renders the week header', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('This week')).toBeInTheDocument());
  });

  it('shows a placement banner and disables slots until placing', async () => {
    renderPage();
    await waitFor(() => screen.getByText('This week'));

    // Not placing yet → empty slots are disabled.
    const someSlot = screen.getAllByRole('button', { name: /slot .*empty/i })[0]!;
    expect(someSlot).toBeDisabled();

    // Enter placement mode.
    await userEvent.click(screen.getByRole('button', { name: 'prime' }));
    expect(screen.getByText(/Placing/)).toBeInTheDocument();
    expect(screen.getByText('Thai Green Curry')).toBeInTheDocument();

    // Now empty slots are placement targets.
    const targets = screen.getAllByRole('button', { name: /place here/i });
    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0]).toBeEnabled();
  });

  it('places the meal into a slot and exits placement mode', async () => {
    renderPage();
    await waitFor(() => screen.getByText('This week'));
    await userEvent.click(screen.getByRole('button', { name: 'prime' }));

    const target = screen.getAllByRole('button', { name: /place here/i })[0]!;
    await userEvent.click(target);

    await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(1));
    // Placement banner is gone.
    expect(screen.queryByText(/Placing/)).not.toBeInTheDocument();
    // Toast confirms.
    expect(screen.getByText(/planned for .* dinner|planned for/i)).toBeInTheDocument();
  });

  it('cancels placement without placing', async () => {
    renderPage();
    await waitFor(() => screen.getByText('This week'));
    await userEvent.click(screen.getByRole('button', { name: 'prime' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/Placing/)).not.toBeInTheDocument();
    expect(addEntry).not.toHaveBeenCalled();
  });
});

describe('CalendarPage planned meals (FR-022 / FR-024)', () => {
  const plannedDay = (): string => {
    // Any day of the currently-displayed week — recompute like the page does.
    const { getWeekStart, getWeekDays } = weekUtils;
    return getWeekDays(getWeekStart(0))[2]!;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMealPlan.mockResolvedValue({
      weekStart: weekUtils.getWeekStart(0),
      entries: [
        {
          slotId: 'slot-1',
          date: plannedDay(),
          mealType: 'dinner',
          meal: { ...meal, recipeUrl: 'https://www.recipetineats.com/thai-green-curry/' },
        },
      ],
    });
  });

  it('opens the detail modal with a recipe link when a planned meal is clicked (FR-024)', async () => {
    renderPage();
    const tile = await screen.findByLabelText('dinner: Thai Green Curry');
    await userEvent.click(tile);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Thai Green Curry');
    const link = screen.getByRole('link', { name: /view recipe/i });
    expect(link).toHaveAttribute('href', 'https://www.recipetineats.com/thai-green-curry/');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('clear (×) removes the entry without opening the modal', async () => {
    renderPage();
    await screen.findByLabelText('dinner: Thai Green Curry');
    await userEvent.click(screen.getByRole('button', { name: /clear dinner thai green curry/i }));

    await waitFor(() => expect(removeEntry).toHaveBeenCalledWith(expect.any(String), 'slot-1'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the planned meal as a draggable (FR-022 drag-and-drop rearrangement)', async () => {
    renderPage();
    const tile = await screen.findByLabelText('dinner: Thai Green Curry');
    // dnd-kit wires draggables with role/aria — the concrete drag interaction is
    // covered by the Playwright e2e (calendar-dnd.e2e.ts).
    expect(tile).toHaveAttribute('aria-roledescription', 'draggable');
  });
});
