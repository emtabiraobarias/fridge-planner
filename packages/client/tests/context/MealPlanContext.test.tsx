import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MealPlan, MealPlanEntry } from '../../src/types/meal-plan';
import { MealPlanProvider, useMealPlan } from '../../src/context/MealPlanContext';

const mockMeal = {
  mealName: 'Chicken Fried Rice',
  suggestedMealType: 'dinner' as const,
  prepTimeMinutes: 25,
  cuisine: 'Asian',
  description: 'Quick rice dish.',
  usesIngredients: ['chicken breast', 'rice'],
  expiringIngredients: ['chicken breast'],
  missingIngredients: [],
};

const mockEntry: MealPlanEntry = {
  slotId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  date: '2026-04-06T00:00:00.000Z',
  mealType: 'dinner',
  meal: mockMeal,
};

const mockPlan: MealPlan = {
  _id: 'plan-id-1',
  userId: 'user-1',
  weekStart: '2026-04-06T00:00:00.000Z',
  entries: [mockEntry],
  createdAt: '2026-04-06T00:00:00.000Z',
  updatedAt: '2026-04-06T00:00:00.000Z',
};

// Mock service module
vi.mock('../../src/services/meal-plans', () => ({
  fetchMealPlan: vi.fn(),
  addEntry: vi.fn(),
  removeEntry: vi.fn(),
  replaceEntries: vi.fn(),
}));

import {
  fetchMealPlan,
  addEntry,
  removeEntry,
  replaceEntries,
} from '../../src/services/meal-plans';

const mockFetchMealPlan = vi.mocked(fetchMealPlan);
const mockAddEntry = vi.mocked(addEntry);
const mockRemoveEntry = vi.mocked(removeEntry);
const mockReplaceEntries = vi.mocked(replaceEntries);

// Test consumer component
function TestConsumer(): React.JSX.Element {
  const {
    plan,
    loading,
    error,
    currentWeekStart,
    assignMeal,
    unassignMeal,
    moveMeal,
    setWeekOffset,
  } = useMealPlan();

  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'idle'}</span>
      <span data-testid="error">{error}</span>
      <span data-testid="entries">{plan?.entries.length ?? 0}</span>
      <span data-testid="weekStart">{currentWeekStart}</span>
      <button
        onClick={() => {
          void assignMeal({
            date: '2026-04-06T00:00:00.000Z',
            mealType: 'dinner',
            meal: mockMeal,
          });
        }}
      >
        Assign
      </button>
      <button
        onClick={() => {
          void unassignMeal(mockEntry.slotId);
        }}
      >
        Unassign
      </button>
      <button
        onClick={() => {
          void moveMeal(mockEntry.slotId, '2026-04-07T00:00:00.000Z', 'lunch');
        }}
      >
        Move
      </button>
      <button onClick={() => setWeekOffset(1)}>Next week</button>
    </div>
  );
}

function renderWithProvider(): void {
  render(
    <MealPlanProvider>
      <TestConsumer />
    </MealPlanProvider>,
  );
}

describe('MealPlanContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchMealPlan.mockResolvedValue(mockPlan);
    mockAddEntry.mockResolvedValue({ ...mockPlan, entries: [...mockPlan.entries] });
    mockRemoveEntry.mockResolvedValue({ ...mockPlan, entries: [] });
    mockReplaceEntries.mockResolvedValue(mockPlan);
  });

  it('starts in loading state and then loads plan', async () => {
    renderWithProvider();
    expect(screen.getByTestId('loading').textContent).toBe('loading');
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('idle');
    });
    expect(screen.getByTestId('entries').textContent).toBe('1');
  });

  it('sets error when fetchMealPlan rejects', async () => {
    mockFetchMealPlan.mockRejectedValueOnce(new Error('Network error'));
    renderWithProvider();
    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('Failed to load meal plan');
    });
  });

  it('assignMeal calls addEntry and refreshes', async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));

    await act(async () => {
      screen.getByRole('button', { name: 'Assign' }).click();
    });

    expect(mockAddEntry).toHaveBeenCalledTimes(1);
    const [weekStart, entry] = mockAddEntry.mock.calls[0] as [string, MealPlanEntry];
    expect(weekStart).toBeDefined();
    expect(entry.mealType).toBe('dinner');
    expect(entry.meal.mealName).toBe('Chicken Fried Rice');
    // slotId should be a UUID
    expect(entry.slotId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('unassignMeal calls removeEntry and refreshes', async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));

    await act(async () => {
      screen.getByRole('button', { name: 'Unassign' }).click();
    });

    expect(mockRemoveEntry).toHaveBeenCalledWith(
      expect.any(String),
      mockEntry.slotId,
    );
  });

  it('moveMeal calls replaceEntries with updated entry', async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));

    await act(async () => {
      screen.getByRole('button', { name: 'Move' }).click();
    });

    expect(mockReplaceEntries).toHaveBeenCalledTimes(1);
    const [, entries] = mockReplaceEntries.mock.calls[0] as [string, MealPlanEntry[]];
    expect(entries).toHaveLength(1);
    expect(entries[0].slotId).toBe(mockEntry.slotId);
    expect(entries[0].date).toBe('2026-04-07T00:00:00.000Z');
    expect(entries[0].mealType).toBe('lunch');
  });

  it('setWeekOffset triggers a re-fetch for the new week', async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));

    await act(async () => {
      screen.getByRole('button', { name: 'Next week' }).click();
    });

    await waitFor(() => {
      // fetchMealPlan called twice: initial + after offset change
      expect(mockFetchMealPlan).toHaveBeenCalledTimes(2);
    });
  });

  it('exposes currentWeekStart as a Monday ISO string', async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));

    const weekStart = screen.getByTestId('weekStart').textContent ?? '';
    const day = new Date(weekStart).getUTCDay();
    expect(day).toBe(1); // Monday
  });
});
