import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DayStrip } from '../../../src/components/calendar/DayStrip';
import { getWeekDays, getWeekStart } from '../../../src/lib/date-utils';

/**
 * FR-RS-012: the phone-only seven-day strip. Consumes the same `getWeekDays()`
 * output as the shipped grid (research D4) — no bespoke date math.
 */
describe('DayStrip', () => {
  const days = getWeekDays(getWeekStart(0));

  it('renders a 7-column tablist with exactly one selected day', () => {
    render(
      <DayStrip
        days={days}
        selectedDate={days[2]!}
        hasMeals={() => false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(7);

    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    for (const [i, tab] of tabs.entries()) {
      if (i !== 2) expect(tab).toHaveAttribute('aria-selected', 'false');
    }
  });

  it('marks days containing meals with a dot indicator distinct from empty days', () => {
    render(
      <DayStrip
        days={days}
        selectedDate={days[0]!}
        hasMeals={(d) => d === days[3]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId(`day-dot-filled-${days[3]}`)).toBeInTheDocument();
    expect(screen.getByTestId(`day-dot-empty-${days[0]}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`day-dot-filled-${days[0]}`)).not.toBeInTheDocument();
  });

  it('fires onSelect with the tapped day', async () => {
    const onSelect = vi.fn();
    render(
      <DayStrip days={days} selectedDate={days[0]!} hasMeals={() => false} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getAllByRole('tab')[4]!);
    expect(onSelect).toHaveBeenCalledWith(days[4]);
  });

  it('gives every day tab a real accessible name (keyboard-operable, not colour-only)', () => {
    render(
      <DayStrip days={days} selectedDate={days[0]!} hasMeals={() => false} onSelect={vi.fn()} />,
    );
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.tagName).toBe('BUTTON');
      expect(tab).toHaveAccessibleName();
    }
  });
});
