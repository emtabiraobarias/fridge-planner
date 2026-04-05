import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { MealRecommendation } from '../../types/meal-recommendation';
import { MealCard } from './MealCard';

interface DraggableMealCardProps {
  meal: MealRecommendation;
  index: number;
}

export function DraggableMealCard({ meal, index }: DraggableMealCardProps): React.JSX.Element {
  const id = `recommendation::${meal.mealName}::${index}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { type: 'recommendation', meal },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'opacity-50' : ''}
      {...listeners}
      {...attributes}
    >
      <MealCard meal={meal} />
    </div>
  );
}
