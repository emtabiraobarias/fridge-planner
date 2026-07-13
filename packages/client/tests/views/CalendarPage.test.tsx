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

const addEntry = vi.fn().mockResolvedValue({});
const removeEntry = vi.fn().mockResolvedValue({});

vi.mock('../../src/services/meal-plans', () => ({
  fetchMealPlan: vi.fn().mockResolvedValue(null),
  addEntry: (...a: unknown[]) => addEntry(...a),
  removeEntry: (...a: unknown[]) => removeEntry(...a),
  replaceEntries: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/services/inventory', () => ({
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
