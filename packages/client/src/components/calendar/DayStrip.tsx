'use client';
import { dayNumber, dowIndex } from '../../lib/date-utils';

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DayStripProps {
  /** The 7 ISO date strings of the visible week, from `getWeekDays()` — same
   * UTC-anchored source the retained grid consumes (research D4). */
  days: string[];
  /** One of `days`, the currently selected day. */
  selectedDate: string;
  /** Whether the given day (one of `days`) has any planned/cooked meals. */
  hasMeals: (date: string) => boolean;
  onSelect: (date: string) => void;
}

/**
 * Phone-only seven-day strip (spec 010 US3, design §4.3.2, FR-RS-012).
 * `role="tablist"`/`role="tab"` semantics per the design's accessibility
 * note (§9); each cell is a real, keyboard-operable `<button>` with an
 * accessible name distinguishing it by more than the selected/dot styling.
 */
export function DayStrip({
  days,
  selectedDate,
  hasMeals,
  onSelect,
}: DayStripProps): React.JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="Select a day"
      data-testid="day-strip"
      className="grid grid-cols-7 gap-[7px]"
    >
      {days.map((day) => {
        const selected = day === selectedDate;
        const meals = hasMeals(day);
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={`Select ${DOW_FULL[dowIndex(day)]} ${dayNumber(day)}`}
            onClick={() => onSelect(day)}
            className={`flex min-h-11 flex-col items-center gap-1 rounded-2xl py-2.5 ${
              selected ? 'bg-accent text-bg' : 'bg-surface text-ink'
            }`}
          >
            <span className="text-[9.5px] font-bold uppercase tracking-wide">
              {DOW[dowIndex(day)]}
            </span>
            <span className="font-heading text-[20px]">{dayNumber(day)}</span>
            <span
              aria-hidden="true"
              data-testid={meals ? `day-dot-filled-${day}` : `day-dot-empty-${day}`}
              className={`h-[5px] w-[5px] rounded-full ${
                meals ? (selected ? 'bg-bg' : 'bg-accent') : 'bg-transparent'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
