import type { MealRecommendation } from '../../types/meal-recommendation';

interface MealSlotCardProps {
  meal: MealRecommendation;
  className?: string;
}

export function MealSlotCard({ meal, className = '' }: MealSlotCardProps): React.JSX.Element {
  return (
    <div className={`rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs ${className}`.trimEnd()}>
      <p className="font-semibold text-indigo-900 leading-tight">{meal.mealName}</p>
      <div className="flex items-center gap-1 mt-1 flex-wrap">
        <span className="rounded-full bg-indigo-200 px-1.5 py-0.5 text-indigo-800">
          {meal.cuisine}
        </span>
        <span className="text-gray-500">{meal.prepTimeMinutes} min</span>
      </div>
    </div>
  );
}
