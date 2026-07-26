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
import { fetchRecommendations } from '../../src/services/inventory';
import { setViewport } from '../setup';

const addEntry = vi.fn().mockResolvedValue({});
const removeEntry = vi.fn().mockResolvedValue({});
const fetchMealPlan = vi.fn().mockResolvedValue(null);
const cookEntry = vi.fn().mockResolvedValue({ plan: null, receipt: [] });

vi.mock('../../src/services/meal-plans', () => ({
  fetchMealPlan: (...a: unknown[]) => fetchMealPlan(...a),
  addEntry: (...a: unknown[]) => addEntry(...a),
  removeEntry: (...a: unknown[]) => removeEntry(...a),
  cookEntry: (...a: unknown[]) => cookEntry(...a),
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

describe('CalendarPage responsive hybrid (US3, FR-RS-012/013/015, research D4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMealPlan.mockResolvedValue(null);
  });

  it('mounts the day strip + day list, and NOT the week grid, at the phone viewport', async () => {
    setViewport('phone');
    renderPage();
    await waitFor(() => screen.getByText('This week'));

    expect(screen.getByTestId('day-strip')).toBeInTheDocument();
    expect(screen.queryByTestId('week-grid')).not.toBeInTheDocument();
  });

  it('mounts the week grid, and NOT the day strip, at the desktop viewport', async () => {
    setViewport('desktop');
    renderPage();
    await waitFor(() => screen.getByText('This week'));

    expect(screen.getByTestId('week-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('day-strip')).not.toBeInTheDocument();
  });

  it('shows the empty-state prompt for the selected day at phone width when nothing is planned', async () => {
    setViewport('phone');
    renderPage();
    await waitFor(() => screen.getByText('This week'));

    expect(screen.getByText(/nothing planned for this day yet/i)).toBeInTheDocument();
  });

  it('issues zero recommendation requests on mount at the phone viewport (FR-RS-015)', async () => {
    setViewport('phone');
    renderPage();
    await waitFor(() => screen.getByText('This week'));
    expect(fetchRecommendations).not.toHaveBeenCalled();
  });

  it('issues zero recommendation requests on mount at the desktop viewport (FR-RS-015)', async () => {
    setViewport('desktop');
    renderPage();
    await waitFor(() => screen.getByText('This week'));
    expect(fetchRecommendations).not.toHaveBeenCalled();
  });

  it('keeps the SuggestionsRail explicit-CTA + ingredient scoping unaffected in both layouts', async () => {
    setViewport('phone');
    renderPage();
    await waitFor(() => screen.getByText('This week'));
    expect(screen.getByRole('button', { name: /get suggestions/i })).toBeInTheDocument();
  });
});

describe('CalendarPage — 44px touch targets (FR-RS-025, SC-RS-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMealPlan.mockResolvedValue(null);
  });

  it('gives the week-nav chevrons a 44px touch target', async () => {
    renderPage();
    await waitFor(() => screen.getByText('This week'));
    const prev = screen.getByRole('button', { name: 'Previous week' });
    const next = screen.getByRole('button', { name: 'Next week' });
    expect(prev.className).toContain('h-11');
    expect(prev.className).toContain('w-11');
    expect(next.className).toContain('h-11');
    expect(next.className).toContain('w-11');
  });
});

describe('CalendarPage tap-to-place on the phone layout (spec 010 FR-RS-012 regression)', () => {
  // User-reported bug 2026-07-26: on mobile you could not place a suggested meal.
  // The phone layout rendered only *existing* entries, so placement mode had no
  // target to tap — while the banner still instructed "tap any open slot".
  it('offers tappable slot targets on phone and places the meal', async () => {
    setViewport('phone');
    renderPage();
    await waitFor(() => screen.getByText('This week'));
    // Phone layout, not the grid.
    expect(screen.getByTestId('day-plan-list')).toBeInTheDocument();
    expect(screen.queryByTestId('week-grid')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'prime' }));

    const targets = screen.getAllByRole('button', { name: /place here/i });
    expect(targets.length).toBeGreaterThan(0);

    await userEvent.click(targets[0]!);
    await waitFor(() => expect(addEntry).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Placing/)).not.toBeInTheDocument();
  });
});
