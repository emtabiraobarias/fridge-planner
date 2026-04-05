import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import type { MealPlan, MealPlanEntry } from '../../../src/types/meal-plan';
import { WeeklyCalendar } from '../../../src/components/calendar/WeeklyCalendar';
import { MealPlanContext } from '../../../src/context/MealPlanContext';
import type { MealPlanContextValue } from '../../../src/context/MealPlanContext';

const mockMeal = {
  mealName: 'Chicken Fried Rice',
  suggestedMealType: 'dinner' as const,
  prepTimeMinutes: 25,
  cuisine: 'Asian',
  description: 'Quick rice dish.',
  usesIngredients: ['chicken breast'],
  expiringIngredients: [],
  missingIngredients: [],
};

// 2026-04-06 is a Monday
const WEEK_START = '2026-04-06T00:00:00.000Z';

const mockEntry: MealPlanEntry = {
  slotId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  date: '2026-04-06T00:00:00.000Z',
  mealType: 'dinner',
  meal: mockMeal,
};

const mockPlan: MealPlan = {
  _id: 'plan-1',
  userId: 'user-1',
  weekStart: WEEK_START,
  entries: [mockEntry],
  createdAt: WEEK_START,
  updatedAt: WEEK_START,
};

function buildCtx(overrides: Partial<MealPlanContextValue> = {}): MealPlanContextValue {
  return {
    plan: mockPlan,
    loading: false,
    error: '',
    currentWeekStart: WEEK_START,
    setWeekOffset: vi.fn(),
    assignMeal: vi.fn().mockResolvedValue(undefined),
    unassignMeal: vi.fn().mockResolvedValue(undefined),
    moveMeal: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderCalendar(ctxValue = buildCtx()): void {
  render(
    <MealPlanContext.Provider value={ctxValue}>
      <DndContext>
        <WeeklyCalendar />
      </DndContext>
    </MealPlanContext.Provider>,
  );
}

describe('WeeklyCalendar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders day headers for the week (Mon–Sun)', () => {
    renderCalendar();
    expect(screen.getAllByText(/Mon/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sun/).length).toBeGreaterThan(0);
  });

  it('renders all four meal-type row labels', () => {
    renderCalendar();
    expect(screen.getByText(/breakfast/i)).toBeInTheDocument();
    expect(screen.getByText(/lunch/i)).toBeInTheDocument();
    expect(screen.getByText(/dinner/i)).toBeInTheDocument();
    expect(screen.getByText(/snack/i)).toBeInTheDocument();
  });

  it('renders a CalendarMealCard for each entry in the plan', () => {
    renderCalendar();
    expect(screen.getByText('Chicken Fried Rice')).toBeInTheDocument();
  });

  it('renders empty slot when no entry exists for a slot', () => {
    renderCalendar();
    // There should be empty slots (28 total - 1 filled = 27 empty)
    const emptySlots = screen.getAllByRole('button', { name: /empty/i });
    expect(emptySlots.length).toBeGreaterThan(0);
  });

  it('calls setWeekOffset(+1) when Next Week button is clicked', async () => {
    const setWeekOffset = vi.fn();
    renderCalendar(buildCtx({ setWeekOffset }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /next week/i }));
    expect(setWeekOffset).toHaveBeenCalledWith(1);
  });

  it('calls setWeekOffset(-1) when Prev Week button is clicked', async () => {
    const setWeekOffset = vi.fn();
    renderCalendar(buildCtx({ setWeekOffset }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /prev week/i }));
    expect(setWeekOffset).toHaveBeenCalledWith(-1);
  });

  it('shows month label in the header', () => {
    renderCalendar();
    expect(screen.getAllByText(/Apr/).length).toBeGreaterThan(0);
  });

  it('calls unassignMeal when remove button is clicked on a meal card', async () => {
    const unassignMeal = vi.fn().mockResolvedValue(undefined);
    renderCalendar(buildCtx({ unassignMeal }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(unassignMeal).toHaveBeenCalledWith(mockEntry.slotId);
  });
});
