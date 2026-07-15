'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import type { MealPlanEntry, MealType } from '../types/meal-plan';
import { useMealPlan } from '../context/MealPlanContext';
import { usePlacement } from '../context/PlacementContext';
import { useToast } from '../context/ToastContext';
import { getWeekDays } from '../lib/date-utils';
import { SuggestionsRail } from '../components/calendar/SuggestionsRail';
import { PlannedMealTile } from '../components/calendar/PlannedMealTile';
import { EmptySlotTarget } from '../components/calendar/EmptySlotTarget';
import { MealDetailModal } from '../components/calendar/MealDetailModal';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayNumber(iso: string): number {
  return new Date(iso).getUTCDate();
}
function dowIndex(iso: string): number {
  return new Date(iso).getUTCDay();
}
function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}
function rangeLabel(days: string[]): string {
  const first = days[0];
  const last = days[6];
  if (!first || !last) return '';
  const a = new Date(first);
  const b = new Date(last);
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

export function CalendarPage(): React.JSX.Element {
  const { plan, currentWeekStart, setWeekOffset, assignMeal, unassignMeal, moveMeal } = useMealPlan();
  const { placing, clearPlacing } = usePlacement();
  const { showToast } = useToast();
  const [weekOffset, setWeekOffsetLocal] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<MealPlanEntry | null>(null);

  // 6px activation distance: a plain click opens the detail modal (FR-024); only an
  // actual drag movement starts a move (FR-022).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const weekDays = getWeekDays(currentWeekStart);
  const today = todayUtcDate();

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const entry = event.active.data.current?.['entry'] as MealPlanEntry | undefined;
    const target = event.over?.data.current as { date: string; mealType: MealType } | undefined;
    if (!entry || !target) return;
    if (entry.date === target.date && entry.mealType === target.mealType) return;
    await moveMeal(entry.slotId, target.date, target.mealType);
    showToast(
      `${entry.meal.mealName} moved to ${DOW_SHORT[dowIndex(target.date)]} ${target.mealType}`,
    );
  }

  function shiftWeek(delta: number): void {
    const next = weekOffset + delta;
    setWeekOffsetLocal(next);
    setWeekOffset(next);
  }

  function getEntry(date: string, mealType: MealType): MealPlanEntry | undefined {
    return plan?.entries.find((e) => e.date === date && e.mealType === mealType);
  }

  async function placeInto(date: string, mealType: MealType): Promise<void> {
    if (!placing) return;
    const meal = placing;
    clearPlacing();
    await assignMeal({ date, mealType, meal });
    showToast(`${meal.mealName} planned for ${DOW_SHORT[dowIndex(date)]} ${mealType}`);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-h2 text-ink">This week</h1>
          <p className="text-muted text-sm">{rangeLabel(weekDays)}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => shiftWeek(-1)}
            className="grid h-9 w-9 place-items-center rounded-full border border-divider text-ink hover:bg-ink/[0.07]"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => shiftWeek(1)}
            className="grid h-9 w-9 place-items-center rounded-full border border-divider text-ink hover:bg-ink/[0.07]"
          >
            →
          </button>
        </div>
      </div>

      {/* Placement banner */}
      {placing && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-full bg-accent2-200 px-5 py-2.5 text-sm text-accent2-900"
        >
          <Check size={16} strokeWidth={2.75} aria-hidden />
          <span>
            Placing <strong>{placing.mealName}</strong> — tap any open slot
          </span>
          <button
            type="button"
            onClick={clearPlacing}
            className="ml-auto font-semibold text-accent2-800 hover:text-accent2-900"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Week grid — DndContext enables dragging planned meals between slots (FR-022) */}
      <DndContext sensors={sensors} onDragEnd={(e) => void handleDragEnd(e)}>
        <div className="overflow-x-auto">
          <div className="grid min-w-[720px] grid-cols-7 gap-2.5">
            {weekDays.map((day) => {
              const isToday = day.slice(0, 10) === today;
              return (
                <div
                  key={day}
                  className={`rounded-lg bg-surface p-2.5 ${isToday ? 'outline outline-2 -outline-offset-2 outline-accent' : ''}`}
                >
                  <div className="mb-2 text-center">
                    <div className="text-[12px] font-semibold uppercase text-ink/60">{DOW[dowIndex(day)]}</div>
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
                            onOpen={setSelectedEntry}
                            onClear={(slotId) => void unassignMeal(slotId)}
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
                          onPlace={(d, mt) => void placeInto(d, mt)}
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

      {/* FR-024: click a planned meal → details + recipe link */}
      <MealDetailModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />

      <SuggestionsRail />
    </div>
  );
}
