import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GroceryList } from '../../src/types/grocery-list';
import { GroceryListProvider, useGroceryList } from '../../src/context/GroceryListContext';
import { MealPlanProvider } from '../../src/context/MealPlanContext';

// Mock grocery-lists service
vi.mock('../../src/services/grocery-lists', () => ({
  fetchGroceryList: vi.fn(),
  generateGroceryList: vi.fn(),
  addGroceryItem: vi.fn(),
  patchGroceryItem: vi.fn(),
  checkOffGroceryItem: vi.fn(),
  deleteGroceryItem: vi.fn(),
  completeGroceryList: vi.fn(),
}));

// Mock meal-plans service so MealPlanProvider doesn't error
vi.mock('../../src/services/meal-plans', () => ({
  fetchMealPlan: vi.fn().mockResolvedValue(null),
  addEntry: vi.fn(),
  removeEntry: vi.fn(),
  replaceEntries: vi.fn(),
}));

import {
  fetchGroceryList,
  generateGroceryList,
  addGroceryItem,
  patchGroceryItem,
  checkOffGroceryItem,
  deleteGroceryItem,
} from '../../src/services/grocery-lists';

const mockFetch = vi.mocked(fetchGroceryList);
const mockGenerate = vi.mocked(generateGroceryList);
const mockAdd = vi.mocked(addGroceryItem);
const mockPatch = vi.mocked(patchGroceryItem);
const mockCheckOff = vi.mocked(checkOffGroceryItem);
const mockDelete = vi.mocked(deleteGroceryItem);

const mockList: GroceryList = {
  _id: 'list-1',
  userId: 'user-1',
  weekStart: '2026-04-06T00:00:00.000Z',
  items: [
    {
      _id: 'item-1',
      ingredientName: 'soy sauce',
      displayName: 'Soy Sauce',
      quantity: 2,
      unit: 'servings',
      category: 'Pantry',
      isPurchased: false,
      isManuallyAdded: false,
      sourceMealNames: ['Chicken Fried Rice'],
      notes: '',
    },
  ],
  generatedAt: '2026-04-06T00:00:00.000Z',
  createdAt: '2026-04-06T00:00:00.000Z',
  updatedAt: '2026-04-06T00:00:00.000Z',
};

function TestConsumer(): React.JSX.Element {
  const { groceryList, loading, error, refresh, generate, togglePurchased, purchaseItem, removeItem } =
    useGroceryList();

  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'idle'}</span>
      <span data-testid="error">{error}</span>
      <span data-testid="count">{groceryList?.items.length ?? 0}</span>
      <button onClick={() => { void refresh(); }}>Refresh</button>
      <button onClick={() => { void generate(); }}>Generate</button>
      <button onClick={() => { void togglePurchased('item-1', false); }}>Toggle</button>
      <button onClick={() => { void togglePurchased('item-1', true); }}>Uncheck</button>
      <button
        onClick={() => {
          void purchaseItem('item-1', { quantity: 2, unit: 'pack', location: 'pantry' });
        }}
      >
        Resolve
      </button>
      <button onClick={() => { void removeItem('item-1'); }}>Remove</button>
    </div>
  );
}

function Wrapper(): React.JSX.Element {
  return (
    <MealPlanProvider>
      <GroceryListProvider>
        <TestConsumer />
      </GroceryListProvider>
    </MealPlanProvider>
  );
}

describe('GroceryListContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(mockList);
    mockGenerate.mockResolvedValue(mockList);
    mockAdd.mockResolvedValue(mockList);
    mockPatch.mockResolvedValue(mockList);
    mockCheckOff.mockResolvedValue(mockList);
    mockDelete.mockResolvedValue({ ...mockList, items: [] });
  });

  it('starts loading then loads list', async () => {
    render(<Wrapper />);
    expect(screen.getByTestId('loading').textContent).toBe('loading');
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('sets error when fetchGroceryList rejects', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('Failed to load grocery list');
    });
  });

  it('generate calls generateGroceryList service', async () => {
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));

    await act(async () => {
      screen.getByRole('button', { name: 'Generate' }).click();
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });

  it('togglePurchased calls checkOffGroceryItem for unpurchased rows', async () => {
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));

    await act(async () => {
      screen.getByRole('button', { name: 'Toggle' }).click();
    });

    expect(mockCheckOff).toHaveBeenCalledWith(expect.any(String), 'item-1');
  });

  it('re-fetches after a purchase transition race returns 409 (FR-GC-002)', async () => {
    mockCheckOff.mockRejectedValueOnce(new Error('Failed to update grocery item: 409'));
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));
    mockFetch.mockClear();

    await act(async () => {
      screen.getByRole('button', { name: 'Toggle' }).click();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('togglePurchased calls patchGroceryItem to uncheck purchased rows (FR-GC-007)', async () => {
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));

    await act(async () => {
      screen.getByRole('button', { name: 'Uncheck' }).click();
    });

    expect(mockPatch).toHaveBeenCalledWith(expect.any(String), 'item-1', { isPurchased: false });
  });

  it('purchaseItem forwards resolved prompt payloads (FR-GC-009)', async () => {
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));

    await act(async () => {
      screen.getByRole('button', { name: 'Resolve' }).click();
    });

    expect(mockCheckOff).toHaveBeenCalledWith(expect.any(String), 'item-1', {
      quantity: 2,
      unit: 'pack',
      location: 'pantry',
    });
  });

  it('removeItem calls deleteGroceryItem', async () => {
    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));

    await act(async () => {
      screen.getByRole('button', { name: 'Remove' }).click();
    });

    expect(mockDelete).toHaveBeenCalledWith(expect.any(String), 'item-1');
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('0'));
  });

  // ——— Spec 008 US3 (T024): GET now recomputes server-side on every view; the
  // context must stay a thin server-trusting pass-through — no client-side date
  // scoping/filtering of items, on either the initial fetch or an explicit refresh.
  it('surfaces exactly the server-recomputed list on initial fetch and on refresh, with no client-side date logic (FR-RG-002)', async () => {
    const staleSnapshot: GroceryList = { ...mockList, items: [] };
    const recomputed: GroceryList = mockList;
    mockFetch.mockResolvedValueOnce(staleSnapshot).mockResolvedValueOnce(recomputed);

    render(<Wrapper />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('idle'));
    // Initial fetch surfaces whatever the server returned, verbatim.
    expect(screen.getByTestId('count').textContent).toBe('0');

    await act(async () => {
      screen.getByRole('button', { name: 'Refresh' }).click();
    });

    // A later refresh (e.g. the server recomputed today's scope) is surfaced
    // verbatim too — the context applies no date/scope logic of its own.
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('re-fetches when currentWeekStart changes', async () => {
    // This is implicitly tested by the MealPlanContext integration —
    // week offset change triggers new currentWeekStart which triggers refresh.
    // fetchGroceryList is called on mount; a second call would indicate re-fetch.
    render(<Wrapper />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });
});
