import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GroceryList } from '../../src/types/grocery-list';
import { GroceryListPage } from '../../src/pages/GroceryListPage';
import { GroceryListProvider } from '../../src/context/GroceryListContext';
import { MealPlanProvider } from '../../src/context/MealPlanContext';
import { InventoryProvider } from '../../src/context/InventoryContext';

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
  fetchInventory: vi.fn().mockResolvedValue({ items: [], summary: { total: 0, expired: 0, expiringSoon: 0 }, pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  fetchRecommendations: vi.fn(),
}));

import { fetchGroceryList, generateGroceryList } from '../../src/services/grocery-lists';

const mockFetch = vi.mocked(fetchGroceryList);
const mockGenerate = vi.mocked(generateGroceryList);

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
    <InventoryProvider>
      <MealPlanProvider>
        <GroceryListProvider>
          <GroceryListPage />
        </GroceryListProvider>
      </MealPlanProvider>
    </InventoryProvider>
  );
}

describe('GroceryListPage', () => {
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

  it('renders items grouped by category', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText('Garlic')).toBeInTheDocument();
      expect(screen.getByText('Soy Sauce')).toBeInTheDocument();
    });
    // Category section labels (aria-label on <section>)
    expect(screen.getByRole('region', { name: /Produce items/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Pantry items/i })).toBeInTheDocument();
  });

  it('shows Complete Shopping button when there are purchased items', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText(/Complete Shopping/i)).toBeInTheDocument();
    });
  });

  it('shows checkout modal when Complete Shopping is clicked', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => screen.getByText(/Complete Shopping/i));
    fireEvent.click(screen.getByText(/Complete Shopping/i));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows search bar only when 5+ items', async () => {
    mockFetch.mockResolvedValue({
      ...mockListWithItems,
      items: mockListWithItems.items,
    });
    render(<Wrapper />);
    await waitFor(() => screen.getByText('Garlic'));
    // Only 2 items → no search bar
    expect(screen.queryByPlaceholderText(/Search items/i)).not.toBeInTheDocument();
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
