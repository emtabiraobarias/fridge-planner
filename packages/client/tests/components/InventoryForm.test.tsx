import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { InventoryForm } from '../../src/components/inventory/InventoryForm';
import type { InventoryItem } from '../../src/services/inventory';

describe('InventoryForm', () => {
  const mockSubmit = vi.fn().mockResolvedValue(undefined);

  it('renders all fields with add heading', () => {
    render(<InventoryForm onSubmit={mockSubmit} />);
    expect(screen.getByRole('form', { name: 'Add ingredient' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByLabelText('Location')).toBeInTheDocument();
    expect(screen.getByLabelText('Expires (optional)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('shows validation errors on empty submit', async () => {
    const user = userEvent.setup();
    render(<InventoryForm onSubmit={mockSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Unit is required')).toBeInTheDocument();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with correct data', async () => {
    const user = userEvent.setup();
    render(<InventoryForm onSubmit={mockSubmit} />);
    await user.type(screen.getByLabelText('Name'), 'Chicken');
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '2');
    await user.type(screen.getByLabelText('Unit'), 'lbs');
    await user.selectOptions(screen.getByLabelText('Category'), 'Meat');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Chicken',
        quantity: 2,
        unit: 'lbs',
        category: 'Meat',
        location: 'fridge',
      }),
    );
  });

  it('pre-populates fields in edit mode', () => {
    const item: InventoryItem = {
      _id: '1',
      name: 'Milk',
      quantity: 1,
      unit: 'litre',
      category: 'Dairy',
      location: 'fridge',
      expiresAt: '2026-04-01T00:00:00.000Z',
      expirationStatus: 'normal',
    };
    render(<InventoryForm item={item} onSubmit={mockSubmit} />);
    expect(screen.getByRole('form', { name: 'Edit ingredient' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Milk');
    expect(screen.getByLabelText('Quantity')).toHaveValue(1);
    expect(screen.getByLabelText('Unit')).toHaveValue('litre');
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });

  it('shows cancel button when onCancel provided', () => {
    const onCancel = vi.fn();
    render(<InventoryForm onSubmit={mockSubmit} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
