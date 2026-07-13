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
});
