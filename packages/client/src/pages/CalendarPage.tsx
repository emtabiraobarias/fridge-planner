import type { DragEndEvent } from '@dnd-kit/core';
import { DndContext } from '@dnd-kit/core';
import type { MealRecommendation } from '../types/meal-recommendation';
import type { MealPlanEntry, MealType } from '../types/meal-plan';
import { useMealPlan } from '../context/MealPlanContext';
import { WeeklyCalendar } from '../components/calendar/WeeklyCalendar';
import { RecommendationsPanel } from '../components/recommendations/RecommendationsPanel';

export function CalendarPage(): React.JSX.Element {
  const { plan, assignMeal, moveMeal } = useMealPlan();

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as
      | { type: 'recommendation'; meal: MealRecommendation }
      | { type: 'planned'; entry: MealPlanEntry }
      | undefined;

    if (!activeData) return;

    // Parse the drop target id: "${isoDate}::${mealType}"
    const overId = String(over.id);
    const separatorIdx = overId.indexOf('::');
    if (separatorIdx === -1) return;
    const date = overId.slice(0, separatorIdx);
    const mealType = overId.slice(separatorIdx + 2) as MealType;

    if (activeData.type === 'recommendation') {
      void assignMeal({ date, mealType, meal: activeData.meal });
    } else if (activeData.type === 'planned') {
      const { entry } = activeData;
      // Only move if it's a different slot
      if (entry.date !== date || entry.mealType !== mealType) {
        void moveMeal(entry.slotId, date, mealType);
      }
    }
  }

  // Compute which slot ids already have entries (to prevent double-booking)
  const occupiedSlots = new Set(
    (plan?.entries ?? []).map((e) => `${e.date}::${e.mealType}`),
  );
  void occupiedSlots; // used in future for visual feedback

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <WeeklyCalendar />
        </div>
        <div>
          <RecommendationsPanel draggable={true} />
        </div>
      </div>
    </DndContext>
  );
}
