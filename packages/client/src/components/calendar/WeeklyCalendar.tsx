import { useState } from 'react';
import type { MealPlanEntry, MealType } from '../../types/meal-plan';
import { useMealPlan } from '../../context/MealPlanContext';
import { getWeekDays, formatDayLabel } from '../../lib/date-utils';
import { CalendarSlot } from './CalendarSlot';
import { MealDetailModal } from './MealDetailModal';

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function WeeklyCalendar(): React.JSX.Element {
  const { plan, currentWeekStart, setWeekOffset, unassignMeal } = useMealPlan();
  const [selectedEntry, setSelectedEntry] = useState<MealPlanEntry | null>(null);
  const [weekOffsetLocal, setWeekOffsetLocal] = useState(0);

  const weekDays = getWeekDays(currentWeekStart);

  function handlePrevWeek(): void {
    const next = weekOffsetLocal - 1;
    setWeekOffsetLocal(next);
    setWeekOffset(next);
  }

  function handleNextWeek(): void {
    const next = weekOffsetLocal + 1;
    setWeekOffsetLocal(next);
    setWeekOffset(next);
  }

  function getEntry(date: string, mealType: MealType): MealPlanEntry | undefined {
    return plan?.entries.find(
      (e) => e.date === date && e.mealType === mealType,
    );
  }

  const firstDay = weekDays[0] ? formatDayLabel(weekDays[0]) : '';
  const lastDay = weekDays[6] ? formatDayLabel(weekDays[6]) : '';

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Prev week"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 focus:outline-none"
          onClick={handlePrevWeek}
        >
          ← Prev
        </button>
        <span className="text-sm font-medium text-gray-700">
          {firstDay} – {lastDay}
        </span>
        <button
          type="button"
          aria-label="Next week"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 focus:outline-none"
          onClick={handleNextWeek}
        >
          Next →
        </button>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-xs">
          <thead>
            <tr>
              {/* Meal type column header */}
              <th className="w-20 py-2 text-left text-gray-500 font-normal" />
              {weekDays.map((day) => (
                <th
                  key={day}
                  className="py-2 text-center text-gray-600 font-semibold"
                >
                  {formatDayLabel(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEAL_TYPES.map((mealType) => (
              <tr key={mealType} className="align-top">
                <td className="py-1 pr-2 font-medium text-gray-500 capitalize">
                  {mealType}
                </td>
                {weekDays.map((day) => (
                  <td key={day} className="py-1 px-0.5">
                    <CalendarSlot
                      date={day}
                      mealType={mealType}
                      entry={getEntry(day, mealType)}
                      onRemove={(slotId) => void unassignMeal(slotId)}
                      onClickEntry={setSelectedEntry}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MealDetailModal
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  );
}
