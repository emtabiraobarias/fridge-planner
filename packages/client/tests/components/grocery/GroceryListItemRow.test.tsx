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

describe('GroceryListItemRow', () => {
  it('renders item display name and quantity', () => {
    render(
      <ul>
        <GroceryListItemRow
          item={mockItem}
          onTogglePurchased={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByText('Soy Sauce')).toBeInTheDocument();
    expect(screen.getByText('2 servings')).toBeInTheDocument();
  });

  it('renders source meal names', () => {
    render(
      <ul>
        <GroceryListItemRow
          item={mockItem}
          onTogglePurchased={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByText(/Chicken Fried Rice/)).toBeInTheDocument();
    expect(screen.getByText(/Stir Fry/)).toBeInTheDocument();
  });

  it('calls onTogglePurchased with item id and current value when checkbox clicked', () => {
    const onToggle = vi.fn();
    render(
      <ul>
        <GroceryListItemRow
          item={mockItem}
          onTogglePurchased={onToggle}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggle).toHaveBeenCalledWith('item-1', false);
  });

  it('shows line-through styling when item is purchased', () => {
    render(
      <ul>
        <GroceryListItemRow
          item={{ ...mockItem, isPurchased: true }}
          onTogglePurchased={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </ul>,
    );
    const nameEl = screen.getByText('Soy Sauce');
    expect(nameEl.className).toContain('line-through');
  });

  it('calls onRemove with item id when remove button clicked', () => {
    const onRemove = vi.fn();
    render(
      <ul>
        <GroceryListItemRow
          item={mockItem}
          onTogglePurchased={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={onRemove}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Remove Soy Sauce/i }));
    expect(onRemove).toHaveBeenCalledWith('item-1');
  });

  it('shows edit form when edit button clicked', () => {
    render(
      <ul>
        <GroceryListItemRow
          item={mockItem}
          onTogglePurchased={vi.fn()}
          onUpdate={vi.fn()}
          onRemove={vi.fn()}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit Soy Sauce/i }));
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onUpdate when Save clicked in edit form', () => {
    const onUpdate = vi.fn();
    render(
      <ul>
        <GroceryListItemRow
          item={mockItem}
          onTogglePurchased={vi.fn()}
          onUpdate={onUpdate}
          onRemove={vi.fn()}
        />
      </ul>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Edit Soy Sauce/i }));
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdate).toHaveBeenCalledWith('item-1', expect.objectContaining({ unit: 'servings' }));
  });
});
