import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/inventory', () => ({
  fetchInventory: vi.fn().mockResolvedValue({
    items: [{ _id: 'm1', name: 'Milk', quantity: 1, unit: 'L', category: 'Dairy', location: 'fridge', expirationStatus: 'normal' }],
    summary: { total: 1, expired: 0, expiringSoon: 0 },
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
  }),
  createItem: vi.fn().mockResolvedValue({}),
  updateItem: vi.fn().mockResolvedValue({}),
  deleteItem: vi.fn().mockResolvedValue(undefined),
}));

import { InventoryProvider } from '../../src/context/InventoryContext';
import { InventoryForm } from '../../src/components/inventory/InventoryForm';
import * as inv from '../../src/services/inventory';

async function typeNewMilk(qty: string, unit: string): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await waitFor(() => expect(inv.fetchInventory).toHaveBeenCalled());
  await user.type(screen.getByLabelText('Name'), 'milk'); // different case → still a duplicate
  await user.clear(screen.getByLabelText('Quantity'));
  await user.type(screen.getByLabelText('Quantity'), qty);
  await user.type(screen.getByLabelText('Unit'), unit);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  return user;
}

describe('InventoryForm duplicate handling (EC-03)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prompts (does not silently add) when the ingredient already exists', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<InventoryProvider><InventoryForm onSubmit={onSubmit} /></InventoryProvider>);
    await typeNewMilk('2', 'L');
    expect(await screen.findByText(/already in your inventory/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /merge/i })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled(); // not added until the user chooses
  });

  it('Merge sums the quantity into the existing item', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<InventoryProvider><InventoryForm onSubmit={onSubmit} /></InventoryProvider>);
    const user = await typeNewMilk('2', 'L');
    await user.click(await screen.findByRole('button', { name: /merge/i }));
    await waitFor(() =>
      expect(inv.updateItem).toHaveBeenCalledWith('m1', expect.objectContaining({ quantity: 3 })),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Add separately creates a new item via onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<InventoryProvider><InventoryForm onSubmit={onSubmit} /></InventoryProvider>);
    const user = await typeNewMilk('2', 'L');
    await user.click(await screen.findByRole('button', { name: /add separately/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'milk', quantity: 2, unit: 'L' })),
    );
    expect(inv.updateItem).not.toHaveBeenCalled();
  });
});
