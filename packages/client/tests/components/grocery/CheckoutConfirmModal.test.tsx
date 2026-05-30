import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CheckoutConfirmModal } from '../../../src/components/grocery/CheckoutConfirmModal';
import type { GroceryListItem } from '../../../src/types/grocery-list';

const mockItem: GroceryListItem = {
  _id: 'item-1',
  ingredientName: 'milk',
  displayName: 'Whole Milk',
  quantity: 2,
  unit: 'liters',
  category: 'Dairy',
  isPurchased: true,
  isManuallyAdded: false,
  sourceMealNames: [],
  notes: '',
};

describe('CheckoutConfirmModal', () => {
  it('renders nothing when purchasedItems is empty', () => {
    const { container } = render(
      <CheckoutConfirmModal purchasedItems={[]} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog with item details', () => {
    render(
      <CheckoutConfirmModal purchasedItems={[mockItem]} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Whole Milk')).toBeInTheDocument();
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CheckoutConfirmModal purchasedItems={[mockItem]} onConfirm={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close icon button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CheckoutConfirmModal purchasedItems={[mockItem]} onConfirm={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /close modal/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <CheckoutConfirmModal purchasedItems={[mockItem]} onConfirm={vi.fn()} onClose={onClose} />,
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm with item payloads when Add to Inventory is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <CheckoutConfirmModal purchasedItems={[mockItem]} onConfirm={onConfirm} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /add to inventory/i }));
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ itemId: 'item-1', name: 'Whole Milk' }),
    ]);
  });

  it('allows updating a form field', () => {
    render(
      <CheckoutConfirmModal purchasedItems={[mockItem]} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    const quantityInput = screen.getByDisplayValue('2');
    fireEvent.change(quantityInput, { target: { value: '3' } });
    expect(quantityInput).toHaveValue(3);
  });
});
