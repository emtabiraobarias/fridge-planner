import { useDroppable } from '@dnd-kit/core';
import type { MealPlanEntry, MealType } from '../../types/meal-plan';
import { CalendarMealCard } from './CalendarMealCard';

interface CalendarSlotProps {
  date: string;
  mealType: MealType;
  entry: MealPlanEntry | undefined;
  onRemove: (slotId: string) => void;
  onClickEntry: (entry: MealPlanEntry) => void;
}

export function CalendarSlot({
  date,
  mealType,
  entry,
  onRemove,
  onClickEntry,
}: CalendarSlotProps): React.JSX.Element {
  const id = `${date}::${mealType}`;
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[64px] rounded-lg border-2 border-dashed p-1 transition-colors ${
        isOver ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'
      }`}
    >
      {entry ? (
        <CalendarMealCard entry={entry} onRemove={onRemove} onClick={onClickEntry} />
      ) : (
        <button
          type="button"
          aria-label={`Empty ${mealType} slot`}
          className="h-full w-full cursor-default"
          tabIndex={-1}
        />
      )}
    </div>
  );
}
