'use client';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { MealPlanEntry } from '../../types/meal-plan';

interface PlannedMealTileProps {
  entry: MealPlanEntry;
  /** Open the meal-detail modal (FR-024). Fires on plain click — drag needs >6px movement. */
  onOpen: (entry: MealPlanEntry) => void;
  onClear: (slotId: string) => void;
}

/**
 * A planned meal in the week grid: click opens details, drag moves it to another
 * slot (FR-022 — drag-and-drop rearrangement; optional enhancement over tap-to-place
 * per spec 004 FR-UI-026).
 */
export function PlannedMealTile({ entry, onOpen, onClear }: PlannedMealTileProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `entry::${entry.slotId}`,
    data: { entry },
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(entry)}
      className={`relative cursor-grab rounded-md bg-accent2-200 px-2.5 py-2 ${isDragging ? 'z-10 opacity-70 shadow-lg' : ''}`}
      aria-label={`${entry.mealType}: ${entry.meal.mealName}`}
    >
      <div className="text-[10px] font-semibold uppercase text-accent2-700">{entry.mealType}</div>
      <div className="pr-4 text-[12.5px] font-semibold leading-tight text-accent2-900">
        {entry.meal.mealName}
      </div>
      <div className="text-[11px] text-accent2-700">{entry.meal.prepTimeMinutes} min</div>
      <button
        type="button"
        aria-label={`Clear ${entry.mealType} ${entry.meal.mealName}`}
        onClick={(e) => {
          e.stopPropagation();
          onClear(entry.slotId);
        }}
        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full text-accent2-800 hover:bg-accent2-300"
      >
        ×
      </button>
    </div>
  );
}
