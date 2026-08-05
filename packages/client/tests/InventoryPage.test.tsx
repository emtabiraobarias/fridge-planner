import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryPage } from '../src/views/InventoryPage';
import { InventoryProvider } from '../src/context/InventoryContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { RecommendationsProvider } from '../src/context/RecommendationsContext';
import { PlacementProvider } from '../src/context/PlacementContext';
import { ToastProvider } from '../src/context/ToastContext';
import { Toast } from '../src/components/shared/Toast';
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
      <Toast />
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

  it('renders a shelf per storage location with its own item count (spec 010 D7, FR-RS-008)', async () => {
    renderWithProviders();
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /fridge shelf/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: /freezer shelf/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /pantry shelf/i })).toBeInTheDocument();
    // All three known shelves render at zero items rather than disappearing (D7).
    expect(screen.getAllByText('0 items')).toHaveLength(3);
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
      expect.objectContaining({
        name: 'Milk',
        quantity: 2,
        unit: 'L',
        category: 'Dairy',
        location: 'fridge',
      }),
    );
  });

  describe('step-to-zero floors instead of deleting (spec 010 D10, FR-RS-009)', () => {
    it('flooring a quantity to zero via the stepper persists the row and never removes it', async () => {
      (inventoryService.fetchInventory as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [
          {
            _id: 'item-tortillas',
            name: 'Tortillas',
            quantity: 1,
            unit: 'count',
            category: 'Grains',
            location: 'pantry',
            expirationStatus: 'none',
          },
        ],
        summary: { total: 1, expired: 0, expiringSoon: 0 },
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });

      renderWithProviders();
      await waitFor(() => expect(screen.getByText('Tortillas')).toBeInTheDocument());

      await userEvent.click(screen.getByRole('button', { name: /decrease tortillas/i }));

      await waitFor(() => {
        expect(inventoryService.updateItem).toHaveBeenCalledWith('item-tortillas', { quantity: 0 });
      });
      // Flooring never deletes — the stepper path must not call deleteItem.
      expect(inventoryService.deleteItem).not.toHaveBeenCalled();
      // ...and no "removed" toast fires from the stepper (it stays on the delete button).
      expect(screen.queryByText(/tortillas removed/i)).not.toBeInTheDocument();
      // The row remains visible.
      expect(screen.getByText('Tortillas')).toBeInTheDocument();
    });
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
      expect(
        screen.queryByRole('button', { name: /find recipes with selected/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe('quick-add merge + Undo (spec 009 US3, FR-IR-012/013)', () => {
    it('opts quick-add into server-side merging', async () => {
      renderWithProviders();
      await waitFor(() => screen.getByLabelText(/quick add item/i));
      await userEvent.type(screen.getByLabelText(/quick add item/i), '2L milk{Enter}');
      await waitFor(() => expect(inventoryService.createItem).toHaveBeenCalledTimes(1));
      expect(inventoryService.createItem).toHaveBeenCalledWith(
        expect.objectContaining({ mergeDuplicates: true }),
      );
    });

    it('a merge response shows an Undo toast that subtracts addedQuantity from the current quantity, clamped at 0', async () => {
      (inventoryService.fetchInventory as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [
          {
            _id: 'existing-milk',
            name: 'Milk',
            quantity: 7,
            unit: 'L',
            category: 'Dairy',
            location: 'fridge',
            expirationStatus: 'normal',
          },
        ],
        summary: { total: 1, expired: 0, expiringSoon: 0 },
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });
      (inventoryService.createItem as ReturnType<typeof vi.fn>).mockResolvedValue({
        merged: true,
        item: {
          _id: 'existing-milk',
          name: 'Milk',
          quantity: 7,
          unit: 'L',
          category: 'Dairy',
          location: 'fridge',
          expirationStatus: 'normal',
        },
        mergedItemId: 'existing-milk',
        addedQuantity: 2,
      });

      renderWithProviders();
      await waitFor(() => screen.getByLabelText(/quick add item/i));
      await userEvent.type(screen.getByLabelText(/quick add item/i), '2L milk{Enter}');

      const undoButton = await screen.findByRole('button', { name: /undo/i });
      await userEvent.click(undoButton);

      await waitFor(() => {
        expect(inventoryService.updateItem).toHaveBeenCalledWith('existing-milk', { quantity: 5 });
      });
    });

    it('clamps the Undo reversal at 0 instead of going negative', async () => {
      (inventoryService.fetchInventory as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [
          {
            _id: 'existing-milk',
            name: 'Milk',
            quantity: 1,
            unit: 'L',
            category: 'Dairy',
            location: 'fridge',
            expirationStatus: 'normal',
          },
        ],
        summary: { total: 1, expired: 0, expiringSoon: 0 },
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
      });
      (inventoryService.createItem as ReturnType<typeof vi.fn>).mockResolvedValue({
        merged: true,
        item: {
          _id: 'existing-milk',
          name: 'Milk',
          quantity: 1,
          unit: 'L',
          category: 'Dairy',
          location: 'fridge',
          expirationStatus: 'normal',
        },
        mergedItemId: 'existing-milk',
        addedQuantity: 5,
      });

      renderWithProviders();
      await waitFor(() => screen.getByLabelText(/quick add item/i));
      await userEvent.type(screen.getByLabelText(/quick add item/i), '2L milk{Enter}');

      const undoButton = await screen.findByRole('button', { name: /undo/i });
      await userEvent.click(undoButton);

      await waitFor(() => {
        expect(inventoryService.updateItem).toHaveBeenCalledWith('existing-milk', { quantity: 0 });
      });
    });

    it('a non-merge create shows the normal "added" toast with no Undo control', async () => {
      (inventoryService.createItem as ReturnType<typeof vi.fn>).mockResolvedValue({
        merged: false,
        item: {
          _id: 'new-1',
          name: 'Olive Oil',
          quantity: 1,
          unit: 'bottle',
          category: 'Pantry',
          location: 'pantry',
          expirationStatus: 'none',
        },
      });

      renderWithProviders();
      await waitFor(() => screen.getByLabelText(/quick add item/i));
      await userEvent.type(screen.getByLabelText(/quick add item/i), 'olive oil{Enter}');

      expect(await screen.findByText(/added to your/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
    });
  });
});
