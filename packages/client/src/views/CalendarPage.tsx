'use client';
import { useState } from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { MealRecommendation } from '../types/meal-recommendation';
import type { MealPlanEntry, MealType } from '../types/meal-plan';
import { useMealPlan } from '../context/MealPlanContext';
import { WeeklyCalendar } from '../components/calendar/WeeklyCalendar';
import { RecommendationsPanel } from '../components/recommendations/RecommendationsPanel';
import { MealSlotCard } from '../components/calendar/MealSlotCard';

type ActiveDragData =
  | { type: 'recommendation'; meal: MealRecommendation }
  | { type: 'planned'; entry: MealPlanEntry }
  | null;

export function CalendarPage(): React.JSX.Element {
  const { plan, assignMeal, moveMeal } = useMealPlan();
  const [activeDrag, setActiveDrag] = useState<ActiveDragData>(null);

  function handleDragStart(event: DragStartEvent): void {
    const data = event.active.data.current as ActiveDragData;
    setActiveDrag(data ?? null);
  }

  function handleDragEnd(event: DragEndEvent): void {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as ActiveDragData;
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

  function handleDragCancel(): void {
    setActiveDrag(null);
  }

  // Compute which slot ids already have entries (to prevent double-booking)
  const occupiedSlots = new Set(
    (plan?.entries ?? []).map((e) => `${e.date}::${e.mealType}`),
  );
  void occupiedSlots; // used in future for visual feedback

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <WeeklyCalendar />
        </div>
        <div>
          <RecommendationsPanel draggable={true} />
        </div>
      </div>

      <DragOverlay>
        {activeDrag?.type === 'recommendation' ? (
          <MealSlotCard meal={activeDrag.meal} className="cursor-grabbing shadow-lg" />
        ) : activeDrag?.type === 'planned' ? (
          <MealSlotCard meal={activeDrag.entry.meal} className="cursor-grabbing shadow-lg" />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
