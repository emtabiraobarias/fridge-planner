'use client';
import type { MealPlanEntry, MealType } from '../../types/meal-plan';
import { dayNumber, dowIndex } from '../../lib/date-utils';
import { PlannedMealTile } from './PlannedMealTile';
import { EmptySlotTarget } from './EmptySlotTarget';

const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** One slot of the selected day, in the canonical order the grid also uses. */
export interface DaySlot {
  mealType: MealType;
  entry: MealPlanEntry | undefined;
}

interface DayPlanListProps {
  /** The selected day (one of the visible week's ISO date strings). */
  date: string;
  /** All four slots for `date`, breakfast → lunch → dinner → snack. */
  slots: DaySlot[];
  /** Tap-to-place is active — empty slots become tap targets (FR-UI-026). */
  placingMode: boolean;
  onOpenEntry: (entry: MealPlanEntry) => void;
  onClearEntry: (slotId: string) => void;
  onPlace: (date: string, mealType: MealType) => void;
}

/**
 * Phone-only single-day meal list (spec 010 US3, design §4.3.3/4, FR-RS-012).
 * Reuses the shipped `PlannedMealTile` verbatim — cooked-vs-planned
 * distinction (the "Cooked" badge, `entryStatus()`), the click-to-open detail
 * modal, and the clear button are the exact same code path as the retained
 * grid, so the cook/un-cook contract and FR-024 behaviour need no re-test
 * here (research D4).
 *
 * **Placement (user-reported bug, 2026-07-26).** This list originally rendered
 * only *existing* entries, which meant the phone layout had no placement target:
 * tapping "Place" on a suggestion armed placement mode and then left the user
 * stranded, even though the banner said "tap any open slot". It now renders the
 * day's empty slots as `EmptySlotTarget`s — the identical component and
 * `onPlace` contract the grid uses — but **only while placing**, so the calm
 * default view (planned meals, or the empty-day prompt) still matches the design.
 */
export function DayPlanList({
  date,
  slots,
  placingMode,
  onOpenEntry,
  onClearEntry,
  onPlace,
}: DayPlanListProps): React.JSX.Element {
  const planned = slots.filter((s): s is DaySlot & { entry: MealPlanEntry } => Boolean(s.entry));
  const showEmptyDayPrompt = planned.length === 0 && !placingMode;

  return (
    <div className="flex flex-col gap-3" data-testid="day-plan-list">
      <h2 className="font-heading text-h4 text-ink">
        {DOW_FULL[dowIndex(date)]} {dayNumber(date)}
      </h2>

      {showEmptyDayPrompt ? (
        <div className="rounded-[18px] border-[1.5px] border-dashed border-divider p-[18px] text-center text-[13px] font-semibold text-muted">
          Nothing planned for this day yet — add one from the suggestions below.
        </div>
      ) : (
        <div className="flex flex-col gap-[9px]">
          {slots.map(({ mealType, entry }) =>
            entry ? (
              <PlannedMealTile
                key={entry.slotId}
                entry={entry}
                onOpen={onOpenEntry}
                onClear={onClearEntry}
              />
            ) : placingMode ? (
              <EmptySlotTarget
                key={`${date}::${mealType}`}
                date={date}
                mealType={mealType}
                dayNumber={dayNumber(date)}
                placingMode
                onPlace={onPlace}
              />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
