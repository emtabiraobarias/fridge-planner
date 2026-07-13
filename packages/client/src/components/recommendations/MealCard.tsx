import type { MealRecommendation } from '../../types/meal-recommendation';

export function MealCardSkeleton(): React.JSX.Element {
  return (
    <li className="animate-pulse rounded-lg bg-bg p-4">
      <div className="h-4 w-2/5 rounded bg-neutral-300" />
      <div className="mt-3 h-3 w-full rounded bg-neutral-300" />
      <div className="mt-2 h-3 w-4/5 rounded bg-neutral-300" />
      <div className="mt-3 flex gap-1.5">
        <div className="h-5 w-20 rounded-full bg-neutral-300" />
        <div className="h-5 w-16 rounded-full bg-neutral-300" />
      </div>
    </li>
  );
}

const MEAL_TYPE_LABEL: Record<MealRecommendation['suggestedMealType'], string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

interface Props {
  meal: MealRecommendation;
  /** When provided, renders a "Plan it" pill that starts calendar placement. */
  onPlan?: (meal: MealRecommendation) => void;
}

/** Organic meal card (spec 004 §3.2). */
export function MealCard({ meal, onPlan }: Props): React.JSX.Element {
  const expiringSet = new Set(meal.expiringIngredients.map((s) => s.toLowerCase()));
  const nonExpiringUsed = meal.usesIngredients.filter((i) => !expiringSet.has(i.toLowerCase()));

  return (
    <li className="rounded-lg bg-bg p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-heading text-[17px] leading-tight text-ink">{meal.mealName}</h3>
          <p className="text-muted mt-0.5 text-xs">
            {meal.cuisine} · {MEAL_TYPE_LABEL[meal.suggestedMealType]} · {meal.prepTimeMinutes} min
          </p>
        </div>
        {onPlan && (
          <button
            type="button"
            onClick={() => onPlan(meal)}
            className="shrink-0 rounded-full bg-accent px-3.5 py-[7px] text-xs font-semibold text-bg hover:bg-accent-600"
          >
            Plan it
          </button>
        )}
      </div>

      <p className="mt-2 text-[13px] text-ink/75">{meal.description}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {meal.expiringIngredients.map((ing) => (
          <span
            key={ing}
            className="rounded-full bg-accent-200 px-2.5 py-0.5 text-[11px] font-semibold text-accent-800"
          >
            {ing} — use soon
          </span>
        ))}
        {nonExpiringUsed.map((ing) => (
          <span
            key={ing}
            className="rounded-full bg-accent2-100 px-2.5 py-0.5 text-[11px] text-accent2-800"
          >
            {ing}
          </span>
        ))}
        {meal.missingIngredients.map((ing) => (
          <span
            key={ing}
            className="rounded-full border border-accent/70 px-2.5 py-0.5 text-[11px] text-accent/80"
          >
            need {ing}
          </span>
        ))}
      </div>
    </li>
  );
}
