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
  patchGroceryItem,
  completeGroceryList,
} from '../../src/services/grocery-lists';
import { fetchInventory } from '../../src/services/inventory';
import { getAliases, putAlias } from '../../src/services/quick-add';

const mockFetch = vi.mocked(fetchGroceryList);
const mockGenerate = vi.mocked(generateGroceryList);
const mockCheckOff = vi.mocked(checkOffGroceryItem);
const mockPatch = vi.mocked(patchGroceryItem);
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

  it('renders items grouped by category with a progress ring (FR-RS-016)', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByText('Garlic')).toBeInTheDocument();
      expect(screen.getByText('Soy Sauce')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: 'Produce' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pantry' })).toBeInTheDocument();
    // 1 of 2 purchased — the ring shows the checked/total figure, non-colour-only
    // (paired with a numeric aria-valuenow/valuemax, spec 010 FR-RS-016).
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('In the trolley')).toBeInTheDocument();
    const ring = screen.getByRole('progressbar');
    expect(ring).toHaveAttribute('aria-valuenow', '1');
    expect(ring).toHaveAttribute('aria-valuemax', '2');
  });

  it('groups categories in a grid that carries the design column-count breakpoints (FR-RS-016)', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => screen.getByText('Garlic'));
    // 1 column phone / 2 columns iPad-portrait+ / 3 columns iPad-landscape+
    // (design §1.2 "Grocery categories" row — same mapping already shipped for
    // Fridge shelves, InventoryPage.tsx). Structural class assertion: real
    // rendering at both viewports is verified separately in the browser check.
    const grid = screen.getByTestId('grocery-category-groups');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-3');
    expect(grid.className).toContain('items-start');
  });

  it('surfaces the covered week in the progress card so a day-rollover shed row reads as expected (FR-RS-019)', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => screen.getByText('Garlic'));
    // weekLabel(currentWeekStart) is date-derived from "today" (MealPlanContext's
    // getWeekStart), not the mocked list's own weekStart field — so this pins the
    // pattern and placement (promoted into the progress card, spec 010 T037)
    // rather than a specific date.
    const trolley = screen.getByText('In the trolley');
    const card = trolley.closest('div')?.parentElement;
    expect(card).not.toBeNull();
    expect(card?.textContent).toMatch(/Week of \d+–\d+ \w{3} · built from your meal plan/);
  });

  it('shows the inline "Done shopping" button for receipt-less remaining items', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Done shopping — move 2 items into my kitchen/i }),
      ).toBeInTheDocument();
    });
    // No modal dialog in the redesign.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('completes checkout inline and shows a toast', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    mockComplete.mockResolvedValue({
      created: [{ _id: 'inv-1', name: 'Soy Sauce' }],
      updated: [],
      skipped: 0,
      errors: [],
    });
    render(<Wrapper />);
    await waitFor(() => screen.getByRole('button', { name: /Done shopping/i }));
    fireEvent.click(screen.getByRole('button', { name: /Done shopping/i }));
    await waitFor(() => expect(mockComplete).toHaveBeenCalledWith(expect.any(String), []));
    await waitFor(() => expect(screen.getByText(/moved into your kitchen/i)).toBeInTheDocument());
  });

  it('the finish-shopping count is receipt-less rows, not unchecked rows (FR-RS-018 regression pin — reconciliation item 13)', async () => {
    // The design's rejected model reads N as "unchecked". Diverge the two counts
    // deliberately: a checked-but-receipt-less legacy row inflates receiptless.length
    // above the unchecked count, so a wrong (unchecked-based) implementation would
    // still look plausible with a matching number on a naive fixture.
    mockFetch.mockResolvedValue({
      ...mockListWithItems,
      items: [
        // Purchased AND already has a receipt — neither unchecked nor receiptless.
        {
          _id: 'a',
          ingredientName: 'rice',
          displayName: 'Rice',
          quantity: 1,
          unit: 'bag',
          category: 'Grains',
          isPurchased: true,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
          purchaseReceipt: {
            inventoryItemId: 'inv-a',
            quantityAdded: 1,
            unit: 'bag',
            merged: false,
          },
        },
        // Purchased but receipt-less (legacy pre-007 row) — checked, yet still
        // counted by the finish-shopping action.
        {
          _id: 'b',
          ingredientName: 'lemons',
          displayName: 'Lemons',
          quantity: 2,
          unit: 'kg',
          category: 'Produce',
          isPurchased: true,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
        },
        // Unpurchased and receipt-less — the one row a naive "unchecked count"
        // implementation would also get right.
        {
          _id: 'c',
          ingredientName: 'limes',
          displayName: 'Limes',
          quantity: 2,
          unit: 'servings',
          category: 'Produce',
          isPurchased: false,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
        },
      ],
    });
    render(<Wrapper />);
    await waitFor(() => screen.getByText('Limes'));

    // unchecked count = 1 (Limes); receiptless count = 2 (Lemons + Limes).
    expect(
      screen.getByRole('button', { name: /Done shopping — move 2 items into my kitchen/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /move 1 item into my kitchen/i }),
    ).not.toBeInTheDocument();
  });

  it('ticking adds to the kitchen immediately and unticking reverses exactly, via the unchanged handleTogglePurchased path (FR-RS-017 regression pin)', async () => {
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
    const milkItem = {
      _id: 'item-milk',
      ingredientName: 'milk',
      displayName: 'Milk',
      quantity: 3,
      unit: 'servings',
      category: 'Dairy' as const,
      isPurchased: false,
      isManuallyAdded: false,
      sourceMealNames: [],
      notes: '',
    };
    const eggsItem = {
      _id: 'item-eggs',
      ingredientName: 'eggs',
      displayName: 'Eggs',
      quantity: 1,
      unit: 'dozen',
      category: 'Dairy' as const,
      isPurchased: true,
      isManuallyAdded: false,
      sourceMealNames: [],
      notes: '',
      purchaseReceipt: {
        inventoryItemId: 'inv-eggs',
        quantityAdded: 1,
        unit: 'dozen',
        merged: false,
      },
    };
    mockFetch.mockResolvedValue({ ...mockListWithItems, items: [milkItem, eggsItem] });
    // Both items stay on the list across each toggle (checkout never clears it —
    // see the dedicated no-clear pin below); only Milk's purchased state flips.
    mockCheckOff.mockResolvedValue({
      ...mockListWithItems,
      items: [{ ...milkItem, isPurchased: true }, eggsItem],
    });
    const { purchaseReceipt: _eggsReceipt, ...eggsWithoutReceipt } = eggsItem;
    mockPatch.mockResolvedValue({
      ...mockListWithItems,
      items: [milkItem, { ...eggsWithoutReceipt, isPurchased: false }],
    });
    render(<Wrapper />);
    await waitFor(() => screen.getByText('Milk'));

    // Tick: no ambiguity (same-name inventory exists) → immediate add via the
    // shipped spec-007 check-off endpoint, no prompt.
    fireEvent.click(screen.getByRole('checkbox', { name: /mark milk as purchased/i }));
    await waitFor(() => expect(mockCheckOff).toHaveBeenCalledWith(expect.any(String), 'item-milk'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Untick an already-purchased, receipted row → exact reversal via the
    // shipped patch endpoint (isPurchased: false), not a new/different call shape.
    fireEvent.click(screen.getByRole('checkbox', { name: /mark eggs as purchased/i }));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(expect.any(String), 'item-eggs', {
        isPurchased: false,
      }),
    );
    expect(mockFetchInventory).toHaveBeenCalled();
  });

  it('completing checkout never clears the list (FR-RS-018 regression pin — reconciliation item 13)', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    mockComplete.mockResolvedValue({
      created: [{ _id: 'inv-1', name: 'Soy Sauce' }],
      updated: [],
      skipped: 0,
      errors: [],
    });
    render(<Wrapper />);
    await waitFor(() => screen.getByRole('button', { name: /Done shopping/i }));
    fireEvent.click(screen.getByRole('button', { name: /Done shopping/i }));
    await waitFor(() => expect(mockComplete).toHaveBeenCalledWith(expect.any(String), []));
    await waitFor(() => expect(screen.getByText(/moved into your kitchen/i)).toBeInTheDocument());

    // The design's "move N then clear the list" model is rejected (spec.md
    // reconciliation item 13) — the rows and their categories must still render.
    expect(screen.getByText('Garlic')).toBeInTheDocument();
    expect(screen.getByText('Soy Sauce')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Produce' })).toBeInTheDocument();
    expect(screen.queryByText(/No grocery items yet/i)).not.toBeInTheDocument();
  });

  it('calls generate when Regenerate button clicked', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    mockGenerate.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    await waitFor(() => screen.getByRole('button', { name: /Regenerate/i }));
    fireEvent.click(screen.getByRole('button', { name: /Regenerate/i }));
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
  });

  it('gives the Regenerate button a 44px touch target (FR-RS-025, SC-RS-003)', async () => {
    mockFetch.mockResolvedValue(mockListWithItems);
    render(<Wrapper />);
    const button = await screen.findByRole('button', { name: /Regenerate/i });
    expect(button.className).toContain('min-h-[44px]');
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
    expect(mockAdd.mock.calls[1]![1]).toMatchObject({
      displayName: 'Olive Oil',
      category: 'Condiments',
    });
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
