'use client';
import { useState } from 'react';
import { Check } from 'lucide-react';
import type { MealPlanEntry, MealType } from '../types/meal-plan';
import { useMealPlan } from '../context/MealPlanContext';
import { usePlacement } from '../context/PlacementContext';
import { useToast } from '../context/ToastContext';
import { getWeekDays } from '../lib/date-utils';
import { SuggestionsRail } from '../components/calendar/SuggestionsRail';

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
  const { plan, currentWeekStart, setWeekOffset, assignMeal, unassignMeal } = useMealPlan();
  const { placing, clearPlacing } = usePlacement();
  const { showToast } = useToast();
  const [weekOffset, setWeekOffsetLocal] = useState(0);

  const weekDays = getWeekDays(currentWeekStart);
  const today = todayUtcDate();

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

      {/* Week grid */}
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
                        <div
                          key={mealType}
                          className="relative rounded-md bg-accent2-200 px-2.5 py-2"
                          aria-label={`${mealType}: ${entry.meal.mealName}`}
                        >
                          <div className="text-[10px] font-semibold uppercase text-accent2-700">{mealType}</div>
                          <div className="pr-4 text-[12.5px] font-semibold leading-tight text-accent2-900">
                            {entry.meal.mealName}
                          </div>
                          <div className="text-[11px] text-accent2-700">{entry.meal.prepTimeMinutes} min</div>
                          <button
                            type="button"
                            aria-label={`Clear ${mealType} ${entry.meal.mealName}`}
                            onClick={() => void unassignMeal(entry.slotId)}
                            className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full text-accent2-800 hover:bg-accent2-300"
                          >
                            ×
                          </button>
                        </div>
                      );
                    }
                    const placingMode = Boolean(placing);
                    return (
                      <button
                        key={mealType}
                        type="button"
                        disabled={!placingMode}
                        aria-label={`${mealType} slot ${dayNumber(day)}${placingMode ? ', place here' : ', empty'}`}
                        onClick={() => void placeInto(day, mealType)}
                        className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-md border-[1.5px] border-dashed text-[10px] uppercase transition-colors ${
                          placingMode
                            ? 'cursor-pointer border-accent bg-accent-100 text-accent hover:bg-accent-200'
                            : 'border-divider text-ink/50'
                        }`}
                      >
                        <span>{mealType}</span>
                        <span className={placingMode ? 'text-base font-bold text-accent' : 'text-base text-ink/25'}>
                          +
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SuggestionsRail />
    </div>
  );
}
