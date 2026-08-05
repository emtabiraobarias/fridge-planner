'use client';
import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { DragEndEvent } from '@dnd-kit/core';
import type { MealPlanEntry, MealType } from '../types/meal-plan';
import { useMealPlan } from '../context/MealPlanContext';
import { usePlacement } from '../context/PlacementContext';
import { useToast } from '../context/ToastContext';
import { useInventoryOptional } from '../context/InventoryContext';
import { useViewportClass } from '../hooks/useViewportClass';
import { getWeekDays, dowIndex, todayUtcDate } from '../lib/date-utils';
import { buildReviewLines, type ConsumptionReviewLine } from '../lib/consumption-review';
import { SuggestionsRail } from '../components/calendar/SuggestionsRail';
import { WeekGrid } from '../components/calendar/WeekGrid';
import { DayStrip } from '../components/calendar/DayStrip';
import { DayPlanList } from '../components/calendar/DayPlanList';
import { MealDetailModal } from '../components/calendar/MealDetailModal';
import { ConsumptionReviewSheet } from '../components/calendar/ConsumptionReviewSheet';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function rangeLabel(days: string[]): string {
  const first = days[0];
  const last = days[6];
  if (!first || !last) return '';
  const a = new Date(first);
  const b = new Date(last);
  return `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

/** Default selected day (research D4): today when inside the visible week, else the week's first day. */
function defaultSelectedDate(days: string[], todayIso: string): string {
  return days.find((d) => d.slice(0, 10) === todayIso) ?? days[0] ?? todayIso;
}

export function CalendarPage(): React.JSX.Element {
  const { plan, currentWeekStart, setWeekOffset, assignMeal, unassignMeal, moveMeal, cookMeal } =
    useMealPlan();
  const { placing, clearPlacing } = usePlacement();
  const { showToast } = useToast();
  const inventory = useInventoryOptional();
  const vp = useViewportClass();
  // Exactly ONE calendar layout is mounted at a time (D4) — never render-both-
  // and-CSS-toggle: both would register dnd-kit draggables on the same
  // `slotId`s, and Playwright locators match `display:none` nodes.
  const phone = vp === 'phone' || vp === 'phone-landscape';
  const [weekOffset, setWeekOffsetLocal] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<MealPlanEntry | null>(null);
  // Research D5: the consumption-review open state is hoisted here (out of
  // MealDetailModal/CookControls) so the cook flow never nests one overlay
  // inside another — opening the review closes the detail overlay first, one
  // overlay at a time, one trap, unambiguous focus restoration.
  const [cookingEntry, setCookingEntry] = useState<MealPlanEntry | null>(null);
  const [cookSubmitting, setCookSubmitting] = useState(false);
  const cookReview = useMemo(
    () =>
      cookingEntry
        ? buildReviewLines(cookingEntry.meal, inventory?.items ?? [])
        : { lines: [], unresolved: [] },
    [cookingEntry, inventory?.items],
  );

  const weekDays = getWeekDays(currentWeekStart);
  const today = todayUtcDate();

  const [selectedDate, setSelectedDate] = useState<string>(() =>
    defaultSelectedDate(weekDays, today),
  );

  // Re-derive the default selected day whenever the visible week changes
  // (shiftWeek) — a day carried over from the previous week would no longer
  // exist in `weekDays`.
  useEffect(() => {
    setSelectedDate(defaultSelectedDate(getWeekDays(currentWeekStart), todayUtcDate()));
  }, [currentWeekStart]);

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

  function hasMeals(date: string): boolean {
    return MEAL_TYPES.some((mealType) => Boolean(getEntry(date, mealType)));
  }

  function openCookReview(entry: MealPlanEntry): void {
    // Close the detail overlay before opening the review one (D5 — never nest).
    setSelectedEntry(null);
    setCookingEntry(entry);
  }

  async function confirmCook(lines: ConsumptionReviewLine[]): Promise<void> {
    if (!cookingEntry) return;
    const slotId = cookingEntry.slotId;
    setCookSubmitting(true);
    try {
      await cookMeal(slotId, lines);
      await inventory?.refresh();
      setCookingEntry(null);
    } finally {
      setCookSubmitting(false);
    }
  }

  // Same slot order as the grid (breakfast → lunch → dinner → snack), so the
  // phone day list reads the same way the desktop grid's column does. Empty
  // slots are kept (not filtered out) because the phone layout needs them as
  // placement targets while placing — filtering them was the user-reported
  // "can't place a meal on mobile" bug.
  const selectedDaySlots = MEAL_TYPES.map((mealType) => ({
    mealType,
    entry: getEntry(selectedDate, mealType),
  }));

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
            className="grid h-11 w-11 place-items-center rounded-full border border-divider text-ink hover:bg-ink/[0.07]"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => shiftWeek(1)}
            className="grid h-11 w-11 place-items-center rounded-full border border-divider text-ink hover:bg-ink/[0.07]"
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

      {/* Responsive hybrid (US3, D4): exactly one layout mounted at a time. */}
      {phone ? (
        <>
          <DayStrip
            days={weekDays}
            selectedDate={selectedDate}
            hasMeals={hasMeals}
            onSelect={setSelectedDate}
          />
          <DayPlanList
            date={selectedDate}
            slots={selectedDaySlots}
            placingMode={Boolean(placing)}
            onOpenEntry={setSelectedEntry}
            onClearEntry={(slotId) => void unassignMeal(slotId)}
            onPlace={(d, mt) => void placeInto(d, mt)}
          />
        </>
      ) : (
        <WeekGrid
          weekDays={weekDays}
          today={today}
          placing={placing}
          getEntry={getEntry}
          onOpenEntry={setSelectedEntry}
          onClearEntry={(slotId) => void unassignMeal(slotId)}
          onPlaceEntry={(d, mt) => void placeInto(d, mt)}
          onDragEnd={handleDragEnd}
        />
      )}

      {/* FR-024: click a planned meal → details + recipe link */}
      <MealDetailModal
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        onMarkCooked={openCookReview}
      />

      {/* Promoted to a standalone overlay (research D5): opening this closes the
          detail overlay first, so the two never nest. */}
      {cookingEntry && (
        <ConsumptionReviewSheet
          mealName={cookingEntry.meal.mealName}
          lines={cookReview.lines}
          unresolvedNames={cookReview.unresolved}
          submitting={cookSubmitting}
          onConfirm={(lines) => void confirmCook(lines)}
          onCancel={() => setCookingEntry(null)}
        />
      )}

      <SuggestionsRail />
    </div>
  );
}
