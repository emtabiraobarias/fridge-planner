import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import type { MealPlanEntry } from '../../../src/types/meal-plan';
import { CalendarMealCard } from '../../../src/components/calendar/CalendarMealCard';

const mockEntry: MealPlanEntry = {
  slotId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  date: '2026-04-06T00:00:00.000Z',
  mealType: 'dinner',
  meal: {
    mealName: 'Chicken Fried Rice',
    suggestedMealType: 'dinner',
    prepTimeMinutes: 25,
    cuisine: 'Asian',
    description: 'Quick rice dish.',
    usesIngredients: ['chicken breast', 'rice'],
    expiringIngredients: ['chicken breast'],
    missingIngredients: ['soy sauce'],
  },
};

function renderCard(onRemove = vi.fn(), onClick = vi.fn()): void {
  render(
    <DndContext>
      <CalendarMealCard entry={mockEntry} onRemove={onRemove} onClick={onClick} />
    </DndContext>,
  );
}

describe('CalendarMealCard', () => {
  it('renders meal name', () => {
    renderCard();
    expect(screen.getByText('Chicken Fried Rice')).toBeInTheDocument();
  });

  it('renders cuisine badge', () => {
    renderCard();
    expect(screen.getByText('Asian')).toBeInTheDocument();
  });

  it('renders prep time', () => {
    renderCard();
    expect(screen.getByText(/25 min/i)).toBeInTheDocument();
  });

  it('calls onRemove with slotId when × button is clicked', async () => {
    const onRemove = vi.fn();
    renderCard(onRemove);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(onRemove).toHaveBeenCalledWith(mockEntry.slotId);
  });

  it('calls onClick with entry when card body is clicked', async () => {
    const onClick = vi.fn();
    renderCard(vi.fn(), onClick);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /chicken fried rice/i }));
    expect(onClick).toHaveBeenCalledWith(mockEntry);
  });
});
