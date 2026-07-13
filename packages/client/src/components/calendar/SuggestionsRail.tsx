'use client';
import { fetchRecommendations as fetchRecommendationsService } from '../../services/inventory';
import { useRecommendations } from '../../context/RecommendationsContext';
import { usePlacement } from '../../context/PlacementContext';

/** Mini meal cards below the week grid; each starts tap-to-place (spec 004 §3.3). */
export function SuggestionsRail(): React.JSX.Element {
  const { state, meals, setLoading, setMeals, setError } = useRecommendations();
  const { placing, startPlacing } = usePlacement();

  async function handleGet(): Promise<void> {
    setLoading();
    try {
      const result = await fetchRecommendationsService();
      setMeals(result.recommendations, result.fallback ?? null);
    } catch {
      setError('Could not load suggestions.');
    }
  }

  return (
    <section aria-label="Meal suggestions" className="rounded-lg bg-surface p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-h4 text-ink">Suggestions</h2>
          <p className="text-muted text-xs">tap &ldquo;Place&rdquo;, then tap a slot above</p>
        </div>
        {meals.length === 0 && (
          <button
            type="button"
            onClick={() => void handleGet()}
            disabled={state === 'loading'}
            className="rounded-full border border-divider px-4 py-2 text-[13px] hover:bg-ink/[0.07] disabled:opacity-60"
          >
            {state === 'loading' ? 'Thinking…' : 'Get suggestions'}
          </button>
        )}
      </div>

      {meals.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {meals.map((meal, i) => (
            <li key={i} className="rounded-lg bg-bg p-4">
              <h3 className="font-heading text-[15px] text-ink">{meal.mealName}</h3>
              <p className="text-muted mt-0.5 text-xs">
                {meal.cuisine} · {meal.prepTimeMinutes} min
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {meal.expiringIngredients.slice(0, 3).map((ing) => (
                  <span
                    key={ing}
                    className="rounded-full bg-accent-200 px-2 py-0.5 text-[11px] font-semibold text-accent-800"
                  >
                    {ing}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => startPlacing(meal)}
                aria-pressed={placing?.mealName === meal.mealName}
                className="mt-3 rounded-full border border-divider px-3 py-1.5 text-xs font-semibold hover:bg-ink/[0.07]"
              >
                Place on calendar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
