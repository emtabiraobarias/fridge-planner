'use client';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { MealPlanEntry, MealType } from '../../types/meal-plan';
import type { MealRecommendation } from '../../types/meal-recommendation';
import { dayNumber, dowIndex } from '../../lib/date-utils';
import { PlannedMealTile } from './PlannedMealTile';
import { EmptySlotTarget } from './EmptySlotTarget';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

interface WeekGridProps {
  weekDays: string[];
  today: string;
  placing: MealRecommendation | null;
  getEntry: (date: string, mealType: MealType) => MealPlanEntry | undefined;
  onOpenEntry: (entry: MealPlanEntry) => void;
  onClearEntry: (slotId: string) => void;
  onPlaceEntry: (date: string, mealType: MealType) => void;
  onDragEnd: (event: DragEndEvent) => void | Promise<void>;
}

/**
 * The shipped 7×4 week grid, extracted **verbatim** from `CalendarPage.tsx`
 * (spec 010 T030, research D4) — zero behaviour change. `CalendarPage` keeps
 * ownership of every handler (`handleDragEnd`/`placeInto`/`getEntry`) and the
 * UTC date helpers; this component only owns its own `DndContext` + sensors,
 * since drag interaction is purely a rendering concern of the grid itself.
 *
 * Retained verbatim for iPad/desktop viewports. The phone viewport mounts
 * `DayStrip` + `DayPlanList` instead — never both (D4: two live dnd-kit
 * registrations per `slotId` is undefined behaviour, and a hidden copy would
 * break `e2e/calendar-dnd.e2e.ts`'s `.first()` + `boundingBox()` assertions).
 */
export function WeekGrid({
  weekDays,
  today,
  placing,
  getEntry,
  onOpenEntry,
  onClearEntry,
  onPlaceEntry,
  onDragEnd,
}: WeekGridProps): React.JSX.Element {
  // 6px activation distance: a plain click opens the detail modal (FR-024); only an
  // actual drag movement starts a move (FR-022).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  return (
    <DndContext sensors={sensors} onDragEnd={(e) => void onDragEnd(e)}>
      <div className="overflow-x-auto" data-testid="week-grid">
        <div className="grid min-w-[720px] grid-cols-7 gap-2.5">
          {weekDays.map((day) => {
            const isToday = day.slice(0, 10) === today;
            return (
              <div
                key={day}
                className={`rounded-lg bg-surface p-2.5 ${isToday ? 'outline outline-2 -outline-offset-2 outline-accent' : ''}`}
              >
                <div className="mb-2 text-center">
                  <div className="text-[12px] font-semibold uppercase text-ink/60">
                    {DOW[dowIndex(day)]}
                  </div>
                  <div className="font-heading text-[19px] text-ink">{dayNumber(day)}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {MEAL_TYPES.map((mealType) => {
                    const entry = getEntry(day, mealType);
                    if (entry) {
                      return (
                        <PlannedMealTile
                          key={mealType}
                          entry={entry}
                          onOpen={onOpenEntry}
                          onClear={onClearEntry}
                        />
                      );
                    }
                    return (
                      <EmptySlotTarget
                        key={mealType}
                        date={day}
                        mealType={mealType}
                        dayNumber={dayNumber(day)}
                        placingMode={Boolean(placing)}
                        onPlace={onPlaceEntry}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}
