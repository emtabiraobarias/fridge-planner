import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryPage } from '../src/views/InventoryPage';
import { InventoryProvider } from '../src/context/InventoryContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { RecommendationsProvider } from '../src/context/RecommendationsContext';
import { PlacementProvider } from '../src/context/PlacementContext';
import { ToastProvider } from '../src/context/ToastContext';
import * as inventoryService from '../src/services/inventory';

vi.mock('../src/services/inventory', () => ({
  fetchInventory: vi.fn().mockResolvedValue({
    items: [],
    summary: { total: 0, expired: 0, expiringSoon: 0 },
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  }),
  createItem: vi.fn().mockResolvedValue({}),
  updateItem: vi.fn().mockResolvedValue({}),
  deleteItem: vi.fn().mockResolvedValue(undefined),
  fetchRecommendations: vi.fn().mockResolvedValue({ recommendations: [] }),
}));

vi.mock('../src/services/meal-plans', () => ({
  fetchMealPlan: vi.fn().mockResolvedValue(null),
  addEntry: vi.fn().mockResolvedValue({}),
  removeEntry: vi.fn().mockResolvedValue({}),
  replaceEntries: vi.fn().mockResolvedValue({}),
}));

function renderWithProviders(): ReturnType<typeof render> {
  return render(
    <ToastProvider>
      <InventoryProvider>
        <MealPlanProvider>
          <RecommendationsProvider>
            <PlacementProvider>
              <InventoryPage />
            </PlacementProvider>
          </RecommendationsProvider>
        </MealPlanProvider>
      </InventoryProvider>
    </ToastProvider>,
  );
}

describe('InventoryPage (organic redesign)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the smart quick-add', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByLabelText(/quick add item/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Add to your kitchen')).toBeInTheDocument();
  });

  it('renders the location filter with an item count', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText('0 of 0 items')).toBeInTheDocument();
    });
    expect(screen.getByRole('group', { name: /filter by location/i })).toBeInTheDocument();
  });

  it('renders the recommendations panel', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /get recommendations/i })).toBeInTheDocument();
    });
  });

  it('adds an item through quick-add (converts date-only expiry to ISO datetime)', async () => {
    renderWithProviders();
    await waitFor(() => screen.getByLabelText(/quick add item/i));
    await userEvent.type(screen.getByLabelText(/quick add item/i), '2L milk{Enter}');
    await waitFor(() => {
      expect(inventoryService.createItem).toHaveBeenCalledTimes(1);
    });
    expect(inventoryService.createItem).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Milk', quantity: 2, unit: 'L', category: 'Dairy', location: 'fridge' }),
    );
  });

  describe('select mode → scoped recommendations (spec 009 US2, FR-IR-006/007, SC-IR-002)', () => {
    const seededItems = [
      {
        _id: 'item-chicken',
        name: 'Chicken Breast',
        quantity: 1,
        unit: 'kg',
        category: 'Meat',
        location: 'fridge',
        expirationStatus: 'normal',
      },
      {
        _id: 'item-rice',
        name: 'Rice',
        quantity: 2,
        unit: 'cups',
        category: 'Grains',
        location: 'pantry',
        expirationStatus: 'none',
      },
    ];

    function seedInventory(): void {
      (inventoryService.fetchInventory as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: seededItems,
        summary: { total: 2, expired: 0, expiringSoon: 0 },
        pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
      });
    }

    it('ticking ≥1 item reveals a "Find recipes with selected" action that scopes the fetch to the ticked ids', async () => {
      seedInventory();
      renderWithProviders();
      await waitFor(() => expect(screen.getByText('Chicken Breast')).toBeInTheDocument());

      // Enter select mode.
      await userEvent.click(screen.getByRole('button', { name: /select items for recipe/i }));
      // Tick exactly one item.
      await userEvent.click(screen.getByRole('checkbox', { name: /select chicken breast/i }));

      // The single contextual action relabels to "Find recipes with selected" (FR-IR-007).
      const action = await screen.findByRole('button', { name: /find recipes with selected/i });
      await userEvent.click(action);

      expect(inventoryService.fetchRecommendations).toHaveBeenCalledWith(['item-chicken']);
    });

    it('shows the whole-inventory CTA when no selection is active', async () => {
      seedInventory();
      renderWithProviders();
      await waitFor(() => expect(screen.getByText('Chicken Breast')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: /get recommendations/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /find recipes with selected/i })).not.toBeInTheDocument();
    });
  });
});
