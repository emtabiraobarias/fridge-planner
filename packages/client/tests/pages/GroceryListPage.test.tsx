import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GroceryList } from '../../src/types/grocery-list';
import { GroceryListPage } from '../../src/views/GroceryListPage';
import { GroceryListProvider } from '../../src/context/GroceryListContext';
import { MealPlanProvider } from '../../src/context/MealPlanContext';
import { InventoryProvider } from '../../src/context/InventoryContext';
import { ToastProvider } from '../../src/context/ToastContext';
import { Toast } from '../../src/components/shared/Toast';

vi.mock('../../src/services/grocery-lists', () => ({
  fetchGroceryList: vi.fn(),
  generateGroceryList: vi.fn(),
  addGroceryItem: vi.fn(),
  patchGroceryItem: vi.fn(),
  deleteGroceryItem: vi.fn(),
  completeGroceryList: vi.fn(),
}));

vi.mock('../../src/services/meal-plans', () => ({
  fetchMealPlan: vi.fn().mockResolvedValue(null),
  addEntry: vi.fn(),
  removeEntry: vi.fn(),
  replaceEntries: vi.fn(),
}));

vi.mock('../../src/services/inventory', () => ({
  fetchInventory: vi
    .fn()
    .mockResolvedValue({ items: [], summary: { total: 0, expired: 0, expiringSoon: 0 }, pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  fetchRecommendations: vi.fn(),
}));

import {
  fetchGroceryList,
  generateGroceryList,
  completeGroceryList,
} from '../../src/services/grocery-lists';

const mockFetch = vi.mocked(fetchGroceryList);
const mockGenerate = vi.mocked(generateGroceryList);
const mockComplete = vi.mocked(completeGroceryList);

const mockListWithItems: GroceryList = {
  _id: 'list-1',
  userId: 'user-1',
  weekStart: '2026-04-06T00:00:00.000Z',
  items: [
    {
      _id: 'item-1',
      ingredientName: 'garlic',
      displayName: 'Garlic',
      quantity: 1,
      unit: 'servings',
      category: 'Produce',
      isPurchased: false,
      isManuallyAdded: false,
      sourceMealNames: ['Stir Fry'],
      notes: '',
    },
    {
      _id: 'item-2',
      ingredientName: 'soy sauce',
      displayName: 'Soy Sauce',
      quantity: 2,
      unit: 'servings',
      category: 'Pantry',
      isPurchased: true,
      isManuallyAdded: false,
      sourceMealNames: ['Fried Rice'],
      notes: '',
    },
  ],
  generatedAt: '2026-04-06T00:00:00.000Z',
  createdAt: '2026-04-06T00:00:00.000Z',
  updatedAt: '2026-04-06T00:00:00.000Z',
};

function Wrapper(): React.JSX.Element {
  return (
    <ToastProvider>
      <InventoryProvider>
        <MealPlanProvider>
          <GroceryListProvider>
            <GroceryListPage />
            <Toast />
          </GroceryListProvider>
        </MealPlanProvider>
      </InventoryProvider>
    </ToastProvider>
  );
}

describe('GroceryListPage (organic redesign)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => undefined));
    render(<Wrapper />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows empty state when list is null', async () => {
    mockFetch.mockResolvedValue(null);
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/No grocery items yet/i)).toBeInTheDocument();
    });
  });

  it('renders items grouped by category with a progress bar', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText('Garlic')).toBeInTheDocument();
      expect(screen.getByText('Soy Sauce')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Produce' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pantry' })).toBeInTheDocument();
    // 1 of 2 purchased.
    expect(screen.getByText('1/2 in the trolley')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows the inline "Done shopping" button when there are purchased items', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Done shopping — move 1 item into my kitchen/i })).toBeInTheDocument();
    });
    // No modal dialog in the redesign.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('completes checkout inline and shows a toast', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    mockComplete.mockResolvedValue({ created: [{ _id: 'inv-1', name: 'Soy Sauce' }], errors: [] });
    render(<Wrapper />);
    await waitFor(() => screen.getByRole('button', { name: /Done shopping/i }));
    fireEvent.click(screen.getByRole('button', { name: /Done shopping/i }));
    await waitFor(() => expect(mockComplete).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/moved into your kitchen/i)).toBeInTheDocument());
  });

  it('calls generate when Regenerate button clicked', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    mockGenerate.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => screen.getByRole('button', { name: /Regenerate/i }));
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }));
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
  });
});
