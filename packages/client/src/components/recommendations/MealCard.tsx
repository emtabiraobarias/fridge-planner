import type { MealRecommendation } from '../../types/meal-recommendation';

export function MealCardSkeleton(): React.JSX.Element {
  return (
    <li className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden animate-pulse">
      <div className="w-full h-40 bg-gray-200" />
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="h-4 bg-gray-200 rounded w-2/5" />
          <div className="flex items-center gap-1.5">
            <div className="h-5 bg-gray-200 rounded-full w-14" />
            <div className="h-5 bg-gray-200 rounded-full w-12" />
            <div className="h-5 bg-gray-200 rounded-full w-16" />
          </div>
        </div>
        <div className="h-3 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-4/5" />
        <div className="flex flex-wrap gap-1.5 mt-1">
          <div className="h-5 bg-gray-200 rounded-full w-20" />
          <div className="h-5 bg-gray-200 rounded-full w-16" />
          <div className="h-5 bg-gray-200 rounded-full w-24" />
        </div>
      </div>
    </li>
  );
}

interface Props {
  meal: MealRecommendation;
}

const MEAL_TYPE_LABEL: Record<MealRecommendation['suggestedMealType'], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

export function MealCard({ meal }: Props): React.JSX.Element {
  const expiringSet = new Set(meal.expiringIngredients.map((s) => s.toLowerCase()));
  const nonExpiringUsed = meal.usesIngredients.filter(
    (i) => !expiringSet.has(i.toLowerCase()),
  );

  return (
    <li className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Food image */}
      {meal.imageUrl && (
        <img
          src={meal.imageUrl}
          alt={meal.mealName}
          draggable={false}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          className="w-full h-40 object-cover"
        />
      )}

      <div className="p-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-900 leading-snug">{meal.mealName}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {meal.cuisine}
            </span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
              {MEAL_TYPE_LABEL[meal.suggestedMealType]}
            </span>
            <span className="rounded-full bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
              ⏱ {meal.prepTimeMinutes} min
            </span>
            {meal.recipeUrl && (
              <a
                href={meal.recipeUrl}
                target="_blank"
                rel="noopener noreferrer"
                draggable={false}
                className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200 hover:bg-green-100"
              >
                View Recipe ↗
              </a>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">{meal.description}</p>

        {/* Ingredients */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {meal.expiringIngredients.map((ing) => (
            <span
              key={ing}
              className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200"
            >
              ⚠️ {ing}
            </span>
          ))}
          {nonExpiringUsed.map((ing) => (
            <span
              key={ing}
              className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 border border-green-200"
            >
              {ing}
            </span>
          ))}
          {meal.missingIngredients.map((ing) => (
            <span
              key={ing}
              className="rounded-full bg-gray-50 px-2 py-0.5 text-xs italic text-gray-400 border border-gray-200"
            >
              Need: {ing}
            </span>
          ))}
        </div>
      </div>
    </li>
  );
}
