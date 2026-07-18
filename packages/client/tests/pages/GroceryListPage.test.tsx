import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GroceryList } from '../../src/types/grocery-list';
import { GroceryListPage } from '../../src/views/GroceryListPage';
import { GroceryListProvider } from '../../src/context/GroceryListContext';
import { MealPlanProvider } from '../../src/context/MealPlanContext';
import { InventoryProvider } from '../../src/context/InventoryContext';
import { ToastProvider } from '../../src/context/ToastContext';
import { QuickAddProvider } from '../../src/context/QuickAddContext';
import { Toast } from '../../src/components/shared/Toast';

vi.mock('../../src/services/grocery-lists', () => ({
  fetchGroceryList: vi.fn(),
  generateGroceryList: vi.fn(),
  addGroceryItem: vi.fn(),
  patchGroceryItem: vi.fn(),
  checkOffGroceryItem: vi.fn(),
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
  fetchInventory: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  fetchRecommendations: vi.fn(),
}));

vi.mock('../../src/services/quick-add', () => ({
  getAliases: vi.fn().mockResolvedValue([]),
  putAlias: vi.fn(),
  assistParse: vi.fn().mockResolvedValue(null),
}));

import {
  fetchGroceryList,
  generateGroceryList,
  checkOffGroceryItem,
  completeGroceryList,
} from '../../src/services/grocery-lists';
import { fetchInventory } from '../../src/services/inventory';
import { getAliases, putAlias } from '../../src/services/quick-add';

const mockFetch = vi.mocked(fetchGroceryList);
const mockGenerate = vi.mocked(generateGroceryList);
const mockCheckOff = vi.mocked(checkOffGroceryItem);
const mockComplete = vi.mocked(completeGroceryList);
const mockFetchInventory = vi.mocked(fetchInventory);
const mockGetAliases = vi.mocked(getAliases);
const mockPutAlias = vi.mocked(putAlias);

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
        <QuickAddProvider>
          <MealPlanProvider>
            <GroceryListProvider>
              <GroceryListPage />
              <Toast />
            </GroceryListProvider>
          </MealPlanProvider>
        </QuickAddProvider>
      </InventoryProvider>
    </ToastProvider>
  );
}

describe('GroceryListPage (organic redesign)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchInventory.mockResolvedValue({
      items: [],
      summary: { total: 0, expired: 0, expiringSoon: 0 },
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    });
    mockGetAliases.mockResolvedValue([]);
    mockPutAlias.mockResolvedValue(undefined);
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

  it('shows the inline "Done shopping" button for receipt-less remaining items', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Done shopping — move 2 items into my kitchen/i })).toBeInTheDocument();
    });
    // No modal dialog in the redesign.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('completes checkout inline and shows a toast', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    mockComplete.mockResolvedValue({ created: [{ _id: 'inv-1', name: 'Soy Sauce' }], updated: [], skipped: 0, errors: [] });
    render(<Wrapper />);
    await waitFor(() => screen.getByRole('button', { name: /Done shopping/i }));
    fireEvent.click(screen.getByRole('button', { name: /Done shopping/i }));
    await waitFor(() => expect(mockComplete).toHaveBeenCalledWith(expect.any(String), []));
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

  it('quick-adds every comma-separated item (spec 005 FR-IQ-006/007)', async () => {
    const { addGroceryItem } = await import('../../src/services/grocery-lists');
    const mockAdd = vi.mocked(addGroceryItem);
    mockFetch.mockResolvedValue(mockListWithItems);
    mockAdd.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => screen.getByLabelText(/add grocery item/i));
    fireEvent.change(screen.getByLabelText(/add grocery item/i), {
      target: { value: '2 lemons, olive oil' },
    });
    fireEvent.keyDown(screen.getByLabelText(/add grocery item/i), { key: 'Enter' });
    await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(2));
    expect(mockAdd.mock.calls[0]![1]).toMatchObject({ displayName: 'Lemons', quantity: 2 });
    expect(mockAdd.mock.calls[1]![1]).toMatchObject({ displayName: 'Olive Oil', category: 'Condiments' });
  });

  it('opens a prompt for ambiguous servings lines and cancel leaves inventory untouched (FR-GC-009)', async () => {
    mockFetch.mockResolvedValue({
      ...mockListWithItems,
      items: [
        {
          _id: 'item-3',
          ingredientName: 'tortillas',
          displayName: 'Tortillas',
          quantity: 2,
          unit: 'servings',
          category: 'Grains',
          isPurchased: false,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
        },
      ],
    });
    render(<Wrapper />);
    await waitFor(() => screen.getByText('Tortillas'));

    fireEvent.click(screen.getByRole('checkbox', { name: /mark tortillas as purchased/i }));
    await waitFor(() => screen.getByRole('dialog', { name: /tortillas/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockCheckOff).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ticks inferable servings lines without a prompt when same-name inventory exists (FR-GC-004)', async () => {
    mockFetchInventory.mockResolvedValue({
      items: [
        {
          _id: 'inv-1',
          name: 'Milk',
          quantity: 1,
          unit: 'L',
          category: 'Dairy',
          location: 'fridge',
          expirationStatus: 'none',
        },
      ],
      summary: { total: 1, expired: 0, expiringSoon: 0 },
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    mockFetch.mockResolvedValue({
      ...mockListWithItems,
      items: [
        {
          _id: 'item-4',
          ingredientName: 'milk',
          displayName: 'Milk',
          quantity: 3,
          unit: 'servings',
          category: 'Dairy',
          isPurchased: false,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
        },
      ],
    });
    mockCheckOff.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => screen.getByText('Milk'));

    fireEvent.click(screen.getByRole('checkbox', { name: /mark milk as purchased/i }));

    await waitFor(() => expect(mockCheckOff).toHaveBeenCalledWith(expect.any(String), 'item-4'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirming a prompt sends resolved values and learns corrected unit (FR-GC-009/010)', async () => {
    mockFetch.mockResolvedValue({
      ...mockListWithItems,
      items: [
        {
          _id: 'item-5',
          ingredientName: 'tortillas',
          displayName: 'Tortillas',
          quantity: 2,
          unit: 'servings',
          category: 'Grains',
          isPurchased: false,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
        },
      ],
    });
    mockCheckOff.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => screen.getByText('Tortillas'));

    fireEvent.click(screen.getByRole('checkbox', { name: /mark tortillas as purchased/i }));
    await waitFor(() => screen.getByRole('dialog', { name: /tortillas/i }));
    fireEvent.change(screen.getByLabelText(/unit/i), { target: { value: 'pack' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() =>
      expect(mockCheckOff).toHaveBeenCalledWith(expect.any(String), 'item-5', {
        quantity: 2,
        unit: 'pack',
        location: 'pantry',
      }),
    );
    expect(mockPutAlias).toHaveBeenCalledWith('tortillas', { unit: 'pack' });
  });
});
