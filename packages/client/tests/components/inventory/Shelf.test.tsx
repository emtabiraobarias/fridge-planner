import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Shelf } from '../../../src/components/inventory/Shelf';
import type { InventoryItem } from '../../../src/services/inventory';

const noop = (): void => {};

const chicken: InventoryItem = {
  _id: '1',
  name: 'Chicken Breast',
  quantity: 2,
  unit: 'kg',
  category: 'Meat',
  location: 'fridge',
  expirationStatus: 'normal',
};

describe('Shelf (spec 010 US2, FR-RS-008/010)', () => {
  it('renders a Fridge card with its design tint and an N items count', () => {
    render(
      <Shelf location="fridge" items={[chicken]} onStep={noop} onDelete={noop} onEdit={noop} />,
    );
    const card = screen.getByRole('region', { name: /fridge shelf/i });
    expect(card.className).toMatch(/accent2-100/);
    expect(screen.getByText('Fridge')).toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('renders a Freezer card with its design tint', () => {
    render(<Shelf location="freezer" items={[]} onStep={noop} onDelete={noop} onEdit={noop} />);
    const card = screen.getByRole('region', { name: /freezer shelf/i });
    expect(card.className).toMatch(/accent-100/);
    expect(screen.getByText('Freezer')).toBeInTheDocument();
  });

  it('renders a Pantry card with its design tint', () => {
    render(<Shelf location="pantry" items={[]} onStep={noop} onDelete={noop} onEdit={noop} />);
    const card = screen.getByRole('region', { name: /pantry shelf/i });
    expect(card.className).toMatch(/neutral-100/);
    expect(screen.getByText('Pantry')).toBeInTheDocument();
  });

  it('renders a fallback shelf for a location outside the known enum, never dropping it', () => {
    const garage = {
      ...chicken,
      _id: '2',
      location: 'garage' as unknown as InventoryItem['location'],
    };
    render(
      <Shelf location="garage" items={[garage]} onStep={noop} onDelete={noop} onEdit={noop} />,
    );
    const card = screen.getByRole('region', { name: /garage shelf/i });
    expect(card.className).toMatch(/neutral-100/);
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
  });

  it('shows a zero count and an empty hint rather than disappearing', () => {
    render(<Shelf location="pantry" items={[]} onStep={noop} onDelete={noop} onEdit={noop} />);
    expect(screen.getByText('0 items')).toBeInTheDocument();
    expect(screen.getByText(/no ingredients yet/i)).toBeInTheDocument();
  });

  it('keeps edit and delete reachable through the shelf-wrapped InventoryList', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <Shelf
        location="fridge"
        items={[chicken]}
        onStep={noop}
        onDelete={onDelete}
        onEdit={onEdit}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /edit chicken breast/i }));
    expect(onEdit).toHaveBeenCalledWith(chicken);
    await userEvent.click(screen.getByRole('button', { name: /delete chicken breast/i }));
    expect(onDelete).toHaveBeenCalledWith('1');
  });

  it('keeps spec 009 select-mode reachable through the shelf-wrapped InventoryList', async () => {
    const onToggleSelect = vi.fn();
    render(
      <Shelf
        location="fridge"
        items={[chicken]}
        onStep={noop}
        onDelete={noop}
        onEdit={noop}
        selectMode
        selectedIds={new Set<string>()}
        onToggleSelect={onToggleSelect}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /select chicken breast/i }));
    expect(onToggleSelect).toHaveBeenCalledWith('1');
  });
});
