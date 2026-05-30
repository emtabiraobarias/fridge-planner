import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryPage } from '../src/views/InventoryPage';
import { InventoryProvider } from '../src/context/InventoryContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { RecommendationsProvider } from '../src/context/RecommendationsContext';

vi.mock('../src/services/inventory', () => ({
  fetchInventory: vi.fn().mockResolvedValue({
    items: [],
    summary: { total: 0, expired: 0, expiringSoon: 0 },
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  }),
  createItem: vi.fn().mockResolvedValue({}),
  updateItem: vi.fn().mockResolvedValue({}),
  deleteItem: vi.fn().mockResolvedValue(undefined),
  fetchRecommendations: vi.fn().mockResolvedValue('Test recommendations'),
}));

vi.mock('../src/services/meal-plans', () => ({
  fetchMealPlan: vi.fn().mockResolvedValue(null),
  addEntry: vi.fn().mockResolvedValue({}),
  removeEntry: vi.fn().mockResolvedValue({}),
  replaceEntries: vi.fn().mockResolvedValue({}),
}));

function renderWithProviders(): ReturnType<typeof render> {
  return render(
    <InventoryProvider>
      <MealPlanProvider>
        <RecommendationsProvider>
          <InventoryPage />
        </RecommendationsProvider>
      </MealPlanProvider>
    </InventoryProvider>,
  );
}

describe('InventoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the inventory form', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByRole('form', { name: 'Add ingredient' })).toBeInTheDocument();
    });
  });

  it('renders the inventory summary', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByText('0 items')).toBeInTheDocument();
    });
  });

  it('renders the recommendations panel', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /get recommendations/i })).toBeInTheDocument();
    });
  });
});
