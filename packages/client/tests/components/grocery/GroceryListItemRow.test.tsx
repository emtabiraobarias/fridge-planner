import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GroceryListItemRow } from '../../../src/components/grocery/GroceryListItemRow';
import type { GroceryListItem } from '../../../src/types/grocery-list';

const mockItem: GroceryListItem = {
  _id: 'item-1',
  ingredientName: 'soy sauce',
  displayName: 'Soy Sauce',
  quantity: 2,
  unit: 'servings',
  category: 'Pantry',
  isPurchased: false,
  isManuallyAdded: false,
  sourceMealNames: ['Chicken Fried Rice', 'Stir Fry'],
  notes: '',
};

function renderRow(overrides: Partial<Parameters<typeof GroceryListItemRow>[0]> = {}): void {
  render(
    <ul>
      <GroceryListItemRow item={mockItem} onTogglePurchased={vi.fn()} onRemove={vi.fn()} {...overrides} />
    </ul>,
  );
}

describe('GroceryListItemRow (organic)', () => {
  it('renders name, quantity, and source meals', () => {
    renderRow();
    expect(screen.getByText('Soy Sauce')).toBeInTheDocument();
    expect(screen.getByText('2 servings')).toBeInTheDocument();
    expect(screen.getByText(/Chicken Fried Rice/)).toBeInTheDocument();
    expect(screen.getByText(/Stir Fry/)).toBeInTheDocument();
  });

  it('toggles purchase state via the round check', () => {
    const onToggle = vi.fn();
    renderRow({ onTogglePurchased: onToggle });
    fireEvent.click(screen.getByRole('checkbox', { name: /mark soy sauce as purchased/i }));
    expect(onToggle).toHaveBeenCalledWith('item-1', false);
  });

  it('reflects purchased state with aria-checked and line-through', () => {
    renderRow({ item: { ...mockItem, isPurchased: true } });
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Soy Sauce').className).toContain('line-through');
  });

  it('shows when a purchased receipt has moved the item into Kitchen', () => {
    renderRow({
      item: {
        ...mockItem,
        isPurchased: true,
        purchaseReceipt: {
          inventoryItemId: 'inv-1',
          quantityAdded: 2,
          unit: 'servings',
          merged: false,
        },
      },
    });
    expect(screen.getByText('in Kitchen')).toBeInTheDocument();
  });

  it('removes the item', () => {
    const onRemove = vi.fn();
    renderRow({ onRemove });
    fireEvent.click(screen.getByRole('button', { name: /remove soy sauce/i }));
    expect(onRemove).toHaveBeenCalledWith('item-1');
  });
});
