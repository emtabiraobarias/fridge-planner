'use client';
import type { MealPlanEntry } from '../../types/meal-plan';
import { dayNumber, dowIndex } from '../../lib/date-utils';
import { PlannedMealTile } from './PlannedMealTile';

const DOW_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

interface DayPlanListProps {
  /** The selected day (one of the visible week's ISO date strings). */
  date: string;
  /** That day's entries, already resolved via `getEntry()` in slot order
   * (breakfast → lunch → dinner → snack) — the same lookup the grid uses. */
  entries: MealPlanEntry[];
  onOpenEntry: (entry: MealPlanEntry) => void;
  onClearEntry: (slotId: string) => void;
}

/**
 * Phone-only single-day meal list (spec 010 US3, design §4.3.3/4, FR-RS-012).
 * Reuses the shipped `PlannedMealTile` verbatim — cooked-vs-planned
 * distinction (the "Cooked" badge, `entryStatus()`), the click-to-open detail
 * modal, and the clear button are the exact same code path as the retained
 * grid, so the cook/un-cook contract and FR-024 behaviour need no re-test
 * here (research D4).
 */
export function DayPlanList({
  date,
  entries,
  onOpenEntry,
  onClearEntry,
}: DayPlanListProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3" data-testid="day-plan-list">
      <h2 className="font-heading text-h4 text-ink">
        {DOW_FULL[dowIndex(date)]} {dayNumber(date)}
      </h2>
      {entries.length === 0 ? (
        <div className="rounded-[18px] border-[1.5px] border-dashed border-divider p-[18px] text-center text-[13px] font-semibold text-muted">
          Nothing planned for this day yet — add one from the suggestions below.
        </div>
      ) : (
        <div className="flex flex-col gap-[9px]">
          {entries.map((entry) => (
            <PlannedMealTile
              key={entry.slotId}
              entry={entry}
              onOpen={onOpenEntry}
              onClear={onClearEntry}
            />
          ))}
        </div>
      )}
    </div>
  );
}
