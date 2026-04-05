import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { MealPlanEntry } from '../../types/meal-plan';

interface CalendarMealCardProps {
  entry: MealPlanEntry;
  onRemove: (slotId: string) => void;
  onClick: (entry: MealPlanEntry) => void;
}

export function CalendarMealCard({
  entry,
  onRemove,
  onClick,
}: CalendarMealCardProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.slotId,
    data: { type: 'planned', entry },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      // Only pointer/touch listeners for drag — no role="button" here
      {...listeners}
      className={`relative rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs ${isDragging ? 'opacity-50 cursor-grabbing' : 'cursor-grab'}`}
    >
      {/* Card detail button — keyboard accessible; stops pointer events from triggering drag */}
      <button
        type="button"
        aria-label={entry.meal.mealName}
        className="w-full text-left focus:outline-none"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onClick(entry)}
        {...attributes}
      >
        <p className="font-semibold text-indigo-900 leading-tight">{entry.meal.mealName}</p>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          <span className="rounded-full bg-indigo-200 px-1.5 py-0.5 text-indigo-800">
            {entry.meal.cuisine}
          </span>
          <span className="text-gray-500">{entry.meal.prepTimeMinutes} min</span>
        </div>
      </button>

      {/* Remove button */}
      <button
        type="button"
        aria-label="Remove meal"
        className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600 focus:outline-none"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(entry.slotId);
        }}
      >
        ×
      </button>
    </div>
  );
}
