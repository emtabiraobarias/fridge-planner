import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { MealPlanEntry } from '../../../src/types/meal-plan';
import { MealDetailModal } from '../../../src/components/calendar/MealDetailModal';

const mockEntry: MealPlanEntry = {
  slotId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  date: '2026-04-06T00:00:00.000Z',
  mealType: 'dinner',
  meal: {
    mealName: 'Chicken Fried Rice',
    suggestedMealType: 'dinner',
    prepTimeMinutes: 25,
    cuisine: 'Asian',
    description: 'A quick one-pan meal.',
    usesIngredients: ['chicken breast', 'rice'],
    expiringIngredients: ['chicken breast'],
    missingIngredients: ['soy sauce'],
    recipeUrl: 'https://example.com/recipe',
  },
};

describe('MealDetailModal', () => {
  it('does not render when entry is null', () => {
    render(<MealDetailModal entry={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders meal name when entry is provided', () => {
    render(<MealDetailModal entry={mockEntry} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Chicken Fried Rice')).toBeInTheDocument();
  });

  it('renders description', () => {
    render(<MealDetailModal entry={mockEntry} onClose={vi.fn()} />);
    expect(screen.getByText('A quick one-pan meal.')).toBeInTheDocument();
  });

  it('renders cuisine and prep time', () => {
    render(<MealDetailModal entry={mockEntry} onClose={vi.fn()} />);
    expect(screen.getByText('Asian')).toBeInTheDocument();
    expect(screen.getByText(/25 min/i)).toBeInTheDocument();
  });

  it('renders ingredient chips', () => {
    render(<MealDetailModal entry={mockEntry} onClose={vi.fn()} />);
    // chicken breast appears in both usesIngredients and expiringIngredients
    expect(screen.getAllByText('chicken breast').length).toBeGreaterThan(0);
    expect(screen.getByText('rice')).toBeInTheDocument();
    expect(screen.getByText('soy sauce')).toBeInTheDocument();
  });

  it('renders a View Recipe link when recipeUrl is present', () => {
    render(<MealDetailModal entry={mockEntry} onClose={vi.fn()} />);
    const link = screen.getByRole('link', { name: /view recipe/i });
    expect(link).toHaveAttribute('href', 'https://example.com/recipe');
  });

  it('does not render View Recipe link when recipeUrl is absent', () => {
    const entryNoUrl: MealPlanEntry = {
      ...mockEntry,
      meal: { ...mockEntry.meal, recipeUrl: undefined },
    };
    render(<MealDetailModal entry={entryNoUrl} onClose={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /view recipe/i })).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<MealDetailModal entry={mockEntry} onClose={onClose} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    render(<MealDetailModal entry={mockEntry} onClose={onClose} />);
    const user = userEvent.setup();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('MealDetailModal — cooked view (spec 006 FR-MC-015)', () => {
  const cookedEntry: MealPlanEntry = {
    ...mockEntry,
    status: 'cooked',
    cookedAt: '2026-04-06T18:30:00.000Z',
    consumedItems: [
      { inventoryItemId: 'i1', name: 'Chicken Breast', quantityConsumed: 500, unit: 'g' },
      { inventoryItemId: 'i2', name: 'Rice', quantityConsumed: 0, unit: 'units' },
    ],
  };

  it('shows what was consumed when cooked, including not-consumed lines', () => {
    render(<MealDetailModal entry={cookedEntry} onClose={vi.fn()} />);
    expect(screen.getByText('Consumed when cooked', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Chicken Breast — 500 g/)).toBeInTheDocument();
    expect(screen.getByText(/Rice — not consumed/)).toBeInTheDocument();
    // no MealPlanProvider in this render → the un-cook action is unavailable
    expect(screen.queryByRole('button', { name: /un-cook/i })).not.toBeInTheDocument();
  });

  it('hides the receipt section and Mark cooked for a legacy cooked entry (no receipt)', () => {
    const legacy: MealPlanEntry = { ...mockEntry }; // no status → legacy → cooked
    render(<MealDetailModal entry={legacy} onClose={vi.fn()} />);
    expect(screen.queryByText('Consumed when cooked', { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark cooked/i })).not.toBeInTheDocument();
    expect(screen.getByText('Cooked')).toBeInTheDocument(); // badge still shown
  });
});
