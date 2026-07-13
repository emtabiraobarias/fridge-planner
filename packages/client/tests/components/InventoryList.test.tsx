import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { InventoryList } from '../../src/components/inventory/InventoryList';
import type { InventoryItem } from '../../src/services/inventory';

// Far-future / past dates keep these deterministic regardless of the real "today".
function iso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

const base: InventoryItem = {
  _id: '1',
  name: 'Chicken Breast',
  quantity: 2,
  unit: 'kg',
  category: 'Meat',
  location: 'fridge',
  expirationStatus: 'normal',
};

describe('InventoryList (organic redesign)', () => {
  it('renders name, category·location, and quantity', () => {
    render(<InventoryList items={[base]} onStep={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
    expect(screen.getByText(/Meat · fridge/)).toBeInTheDocument();
    expect(screen.getByText(/2 kg/)).toBeInTheDocument();
  });

  it('shows the empty state when there are no items', () => {
    render(<InventoryList items={[]} onStep={() => {}} onDelete={() => {}} />);
    expect(screen.getByText(/no ingredients/i)).toBeInTheDocument();
  });

  it('uses the accent-100 background for expired rows', () => {
    const item = { ...base, expiresAt: iso(-3), expirationStatus: 'expired' as const };
    render(<InventoryList items={[item]} onStep={() => {}} onDelete={() => {}} />);
    const row = screen.getByRole('listitem', { name: /chicken breast/i });
    expect(row.className).toMatch(/accent-100/);
  });

  it('sorts soonest-expiry first, no-expiry last', () => {
    const items: InventoryItem[] = [
      { ...base, _id: 'a', name: 'NoExpiry' },
      { ...base, _id: 'b', name: 'Soon', expiresAt: iso(1) },
      { ...base, _id: 'c', name: 'Later', expiresAt: iso(10) },
    ];
    render(<InventoryList items={items} onStep={() => {}} onDelete={() => {}} />);
    const names = screen.getAllByRole('listitem').map((li) => within(li).getByText(/Soon|Later|NoExpiry/).textContent);
    expect(names).toEqual(['Soon', 'Later', 'NoExpiry']);
  });

  it('steps quantity by the unit-aware amount', async () => {
    const onStep = vi.fn();
    render(<InventoryList items={[base]} onStep={onStep} onDelete={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /increase chicken breast/i }));
    expect(onStep).toHaveBeenCalledWith(base, 0.5); // kg → 0.5
    await userEvent.click(screen.getByRole('button', { name: /decrease chicken breast/i }));
    expect(onStep).toHaveBeenCalledWith(base, -0.5);
  });

  it('deletes an item', async () => {
    const onDelete = vi.fn();
    render(<InventoryList items={[base]} onStep={() => {}} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: /delete chicken breast/i }));
    expect(onDelete).toHaveBeenCalledWith('1');
  });
});
