import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InventoryItem, InventoryResponse } from '../../src/services/inventory';
import type { MealPlan } from '../../src/types/meal-plan';
import type { GroceryList } from '../../src/types/grocery-list';
import { HomePage } from '../../src/views/HomePage';
import { InventoryProvider } from '../../src/context/InventoryContext';
import { MealPlanProvider } from '../../src/context/MealPlanContext';
import { GroceryListProvider } from '../../src/context/GroceryListContext';
import { RecommendationsProvider } from '../../src/context/RecommendationsContext';
import { PlacementProvider } from '../../src/context/PlacementContext';
import { todayUtcDate } from '../../src/lib/date-utils';

vi.mock('../../src/services/inventory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/inventory')>()),
  fetchInventory: vi.fn(),
  fetchRecommendations: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
}));

vi.mock('../../src/services/meal-plans', () => ({
  fetchMealPlan: vi.fn(),
  addEntry: vi.fn(),
  removeEntry: vi.fn(),
  replaceEntries: vi.fn(),
  cookEntry: vi.fn(),
  uncookEntry: vi.fn(),
}));

vi.mock('../../src/services/grocery-lists', () => ({
  fetchGroceryList: vi.fn(),
  generateGroceryList: vi.fn(),
  addGroceryItem: vi.fn(),
  patchGroceryItem: vi.fn(),
  checkOffGroceryItem: vi.fn(),
  deleteGroceryItem: vi.fn(),
  completeGroceryList: vi.fn(),
}));

import { fetchInventory, fetchRecommendations } from '../../src/services/inventory';
import { fetchMealPlan } from '../../src/services/meal-plans';
import { fetchGroceryList } from '../../src/services/grocery-lists';

const mockFetchInventory = vi.mocked(fetchInventory);
const mockFetchRecommendations = vi.mocked(fetchRecommendations);
const mockFetchMealPlan = vi.mocked(fetchMealPlan);
const mockFetchGroceryList = vi.mocked(fetchGroceryList);

const TODAY = todayUtcDate();

const spinach: InventoryItem = {
  _id: 'item-spinach',
  name: 'Spinach',
  quantity: 1,
  unit: 'count',
  category: 'Produce',
  location: 'fridge',
  expiresAt: `${TODAY}T00:00:00.000Z`,
  expirationStatus: 'expiring-soon',
};

const eggs: InventoryItem = {
  _id: 'item-eggs',
  name: 'Eggs',
  quantity: 6,
  unit: 'count',
  category: 'Dairy',
  location: 'fridge',
  expirationStatus: 'normal',
};

function inventoryResponse(items: InventoryItem[]): InventoryResponse {
  return {
    items,
    summary: {
      total: items.length,
      expired: 0,
      expiringSoon: items.filter((i) => i.expirationStatus === 'expiring-soon').length,
    },
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  };
}

const mealPlanWithDinnerTonight: MealPlan = {
  _id: 'plan-1',
  userId: 'user-1',
  weekStart: '2026-01-01T00:00:00.000Z',
  entries: [
    {
      slotId: 'slot-1',
      date: `${TODAY}T00:00:00.000Z`,
      mealType: 'dinner',
      meal: {
        mealName: 'Chicken Adobo',
        suggestedMealType: 'dinner',
        prepTimeMinutes: 45,
        cuisine: 'Filipino',
        description: 'Braised chicken.',
        usesIngredients: [],
        expiringIngredients: [],
        missingIngredients: [],
      },
    },
  ],
  createdAt: '',
  updatedAt: '',
};

const groceryListPartial: GroceryList = {
  _id: 'grocery-1',
  userId: 'user-1',
  weekStart: '2026-01-01T00:00:00.000Z',
  generatedAt: null,
  createdAt: '',
  updatedAt: '',
  items: [
    {
      _id: 'g-1',
      ingredientName: 'garlic',
      displayName: 'Garlic',
      quantity: 1,
      unit: 'servings',
      category: 'Produce',
      isPurchased: true,
      isManuallyAdded: false,
      sourceMealNames: [],
      notes: '',
    },
    {
      _id: 'g-2',
      ingredientName: 'soy sauce',
      displayName: 'Soy Sauce',
      quantity: 1,
      unit: 'servings',
      category: 'Pantry',
      isPurchased: false,
      isManuallyAdded: false,
      sourceMealNames: [],
      notes: '',
    },
  ],
};

function renderHome(): ReturnType<typeof render> {
  return render(
    <InventoryProvider>
      <MealPlanProvider>
        <GroceryListProvider>
          <RecommendationsProvider>
            <PlacementProvider>
              <HomePage />
            </PlacementProvider>
          </RecommendationsProvider>
        </GroceryListProvider>
      </MealPlanProvider>
    </InventoryProvider>,
  );
}

describe('HomePage (FR-RS-020/021/022)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchInventory.mockResolvedValue(inventoryResponse([spinach, eggs]));
    mockFetchMealPlan.mockResolvedValue(mealPlanWithDinnerTonight);
    mockFetchGroceryList.mockResolvedValue(groceryListPartial);
  });

  function statValue(label: string): string | null | undefined {
    return screen.getByText(label).previousElementSibling?.textContent;
  }

  it('renders the four stat figures from the existing contexts (FR-RS-020)', async () => {
    renderHome();
    // "Your kitchen at a glance" is a STATIC heading, so waiting on it proves nothing about
    // the fetched stats — it is satisfied on the first render, before the inventory/meal-plan
    // /grocery contexts resolve. That made this assertion a race that passed on a fast
    // machine and failed on a slower CI runner, reading the pre-load '0'. Wait on a
    // data-derived value instead.
    await waitFor(() => expect(statValue('items tracked')).toBe('2'));

    expect(statValue('expiring soon')).toBe('1');
    expect(statValue('meals planned')).toBe('1');
    expect(statValue('groceries in')).toBe('1/2');
  });

  it('names the correct soonest-expiring item in the banner', async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText('Use it up first')).toBeInTheDocument());
    const banner = screen.getByText('Use it up first').parentElement!;
    expect(within(banner).getByText(/Spinach/)).toBeInTheDocument();
  });

  it('shows the calm banner alternative when nothing is expiring', async () => {
    mockFetchInventory.mockResolvedValue(inventoryResponse([eggs]));
    renderHome();
    await waitFor(() => expect(screen.getByText('Nothing expiring soon')).toBeInTheDocument());
  });

  it('links Tonight and Grocery run cards to /calendar and /grocery (FR-RS-022)', async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText('Tonight')).toBeInTheDocument());

    expect(screen.getByRole('link', { name: /week →/i })).toHaveAttribute('href', '/calendar');
    expect(screen.getByRole('link', { name: /grocery run/i })).toHaveAttribute('href', '/grocery');
    expect(screen.getByText('Chicken Adobo · 45 min')).toBeInTheDocument();
  });

  it('shows calm empty states for every card when the underlying data is empty (FR-RS-022)', async () => {
    mockFetchInventory.mockResolvedValue(inventoryResponse([]));
    mockFetchMealPlan.mockResolvedValue(null);
    mockFetchGroceryList.mockResolvedValue(null);
    renderHome();

    await waitFor(() => expect(screen.getByText('Nothing expiring soon')).toBeInTheDocument());
    expect(screen.getByText('Nothing planned for dinner tonight yet.')).toBeInTheDocument();
    expect(screen.getByText(/no grocery items yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no items tracked yet/i)).toBeInTheDocument();
  });

  it('issues zero recommendation requests on mount, and exactly one scoped request after the Cook this → CTA is tapped (FR-RS-021, SC-RS-005)', async () => {
    mockFetchRecommendations.mockResolvedValue({ recommendations: [] });
    renderHome();
    await waitFor(() => expect(screen.getByText('Use it up first')).toBeInTheDocument());

    // Flush any microtask-queued mount effects before asserting nothing fired.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockFetchRecommendations).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /cook this/i }));

    await waitFor(() => expect(mockFetchRecommendations).toHaveBeenCalledTimes(1));
    expect(mockFetchRecommendations).toHaveBeenCalledWith(['item-spinach']);
  });
});
