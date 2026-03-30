import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { InventoryList } from '../../src/components/inventory/InventoryList';
import type { InventoryItem } from '../../src/services/inventory';

const base: InventoryItem = {
  _id: '1',
  name: 'Chicken Breast',
  quantity: 2,
  unit: 'lbs',
  category: 'Meat',
  location: 'fridge',
  expirationStatus: 'normal',
};

describe('InventoryList', () => {
  it('renders a list of ingredient names', () => {
    render(<InventoryList items={[base]} onDelete={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
    expect(screen.getByText(/2 lbs/)).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    render(<InventoryList items={[]} onDelete={() => {}} onEdit={() => {}} />);
    expect(screen.getByText(/no ingredients/i)).toBeInTheDocument();
  });

  it('applies yellow styling for expiring-soon items', () => {
    const item = { ...base, expirationStatus: 'expiring-soon' as const };
    render(<InventoryList items={[item]} onDelete={() => {}} onEdit={() => {}} />);
    const row = screen.getByRole('listitem', { name: /chicken breast/i });
    expect(row.className).toMatch(/yellow/);
  });

  it('applies red styling and disables actions for expired items (FR-010)', () => {
    const item = { ...base, expirationStatus: 'expired' as const };
    render(<InventoryList items={[item]} onDelete={() => {}} onEdit={() => {}} />);
    const row = screen.getByRole('listitem', { name: /chicken breast/i });
    expect(row.className).toMatch(/red/);
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });

  it('shows expiry date when present', () => {
    const item = { ...base, expiresAt: '2026-04-01T00:00:00.000Z', expirationStatus: 'normal' as const };
    render(<InventoryList items={[item]} onDelete={() => {}} onEdit={() => {}} />);
    expect(screen.getByText(/apr.*2026|2026.*apr/i)).toBeInTheDocument();
  });

  it('shows expiry date in red for an expired item with expiresAt set', () => {
    const item = { ...base, expiresAt: '2026-03-01T00:00:00.000Z', expirationStatus: 'expired' as const };
    render(<InventoryList items={[item]} onDelete={() => {}} onEdit={() => {}} />);
    const dateSpan = screen.getByText(/mar.*2026|2026.*mar/i);
    expect(dateSpan.className).toMatch(/red/);
  });
});
