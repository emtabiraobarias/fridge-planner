'use client';
import { useDroppable } from '@dnd-kit/core';
import type { MealType } from '../../types/meal-plan';

interface EmptySlotTargetProps {
  date: string;
  mealType: MealType;
  dayNumber: number;
  /** Tap-to-place mode is active (spec 004 FR-UI-026 — the primary placement flow). */
  placingMode: boolean;
  onPlace: (date: string, mealType: MealType) => void;
}

/**
 * An empty slot in the week grid: tap target during placement mode, and drop
 * target for dragged planned meals (FR-022).
 */
export function EmptySlotTarget({
  date,
  mealType,
  dayNumber,
  placingMode,
  onPlace,
}: EmptySlotTargetProps): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot::${date}::${mealType}`,
    data: { date, mealType },
  });

  const highlight = placingMode || isOver;
  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={!placingMode}
      aria-label={`${mealType} slot ${dayNumber}${placingMode ? ', place here' : ', empty'}`}
      onClick={() => onPlace(date, mealType)}
      className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-md border-[1.5px] border-dashed text-[10px] uppercase transition-colors ${
        highlight
          ? 'border-accent bg-accent-100 text-accent'
          : 'border-divider text-ink/50'
      } ${placingMode ? 'cursor-pointer hover:bg-accent-200' : ''}`}
    >
      <span>{mealType}</span>
      <span className={highlight ? 'text-base font-bold text-accent' : 'text-base text-ink/25'}>+</span>
    </button>
  );
}
