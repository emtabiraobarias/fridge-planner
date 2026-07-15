import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { EditItemSheet } from '../../../src/components/inventory/EditItemSheet';
import type { InventoryItem } from '../../../src/services/inventory';

const item: InventoryItem = {
  _id: 'id-1',
  name: 'Chicken Breast',
  quantity: 2,
  unit: 'lbs',
  category: 'Meat',
  location: 'fridge',
  expiresAt: '2026-07-20T00:00:00.000Z',
  expirationStatus: 'normal',
};

describe('EditItemSheet (FR-UI-019 revised — expiry + location editor)', () => {
  it('renders nothing without an item', () => {
    render(<EditItemSheet item={null} onClose={() => {}} onSave={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('prefills the current expiry and location', () => {
    render(<EditItemSheet item={item} onClose={() => {}} onSave={vi.fn()} />);
    expect(screen.getByLabelText('Expiry date')).toHaveValue('2026-07-20');
    expect(screen.getByRole('radio', { name: 'Fridge' })).toHaveAttribute('aria-checked', 'true');
  });

  it('saves a new expiry (UTC-midnight anchored) and location', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<EditItemSheet item={item} onClose={onClose} onSave={onSave} />);

    const date = screen.getByLabelText('Expiry date');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-07-25');
    await userEvent.click(screen.getByRole('radio', { name: 'Freezer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith('id-1', {
        expiresAt: '2026-07-25T00:00:00.000Z',
        location: 'freezer',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('clears the expiry ("No expiry" → expiresAt null)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<EditItemSheet item={item} onClose={() => {}} onSave={onSave} />);

    await userEvent.click(screen.getByRole('button', { name: 'No expiry' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith('id-1', { expiresAt: null, location: 'fridge' }),
    );
  });

  it('cancel closes without saving', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<EditItemSheet item={item} onClose={onClose} onSave={onSave} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
