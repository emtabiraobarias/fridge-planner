'use client';
import { useState } from 'react';
import {
  fetchRecommendations as fetchRecommendationsService,
  recommendationsErrorMessage,
} from '../../services/inventory';
import { useRecommendations } from '../../context/RecommendationsContext';
import { useInventoryOptional } from '../../context/InventoryContext';
import { usePlacement } from '../../context/PlacementContext';
import { groundedAmounts, withGroundedAmount } from '../../lib/grounded-ingredients';

/** Mini meal cards below the week grid; each starts tap-to-place (spec 004 §3.3). */
export function SuggestionsRail(): React.JSX.Element {
  const { state, meals, error, linksPending, setLoading, setMeals, setError, checkLinks } =
    useRecommendations();
  const { placing, startPlacing } = usePlacement();
  // Spec 009 US2 (FR-IR-006, research D5): optional ingredient-filter chips built
  // from live inventory. Transient per-surface — this rail's selection is
  // independent of Kitchen select mode; both converge only at the one service call.
  const items = useInventoryOptional()?.items ?? [];
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleChip(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGet(): Promise<void> {
    setLoading();
    try {
      // Same service as the Kitchen path (SC-IR-004); scope only when chips are active.
      const scope = selectedIds.size > 0 ? [...selectedIds] : undefined;
      const result = await fetchRecommendationsService(scope);
      setMeals(result.recommendations, result.fallback ?? null);
      // FR-037 lazy phase (fallback sets already carry pre-verified links).
      if (!result.fallback) void checkLinks(result.recommendations);
    } catch (err) {
      setError(recommendationsErrorMessage(err, 'Could not load suggestions.'));
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

      {meals.length === 0 && items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Filter suggestions by ingredient">
          {items.map((item) => {
            const active = selectedIds.has(item._id);
            return (
              <button
                key={item._id}
                type="button"
                aria-label={`Filter by ${item.name}`}
                aria-pressed={active}
                onClick={() => toggleChip(item._id)}
                className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${
                  active
                    ? 'border-accent bg-accent text-bg'
                    : 'border-divider text-ink hover:bg-ink/[0.07]'
                }`}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      )}

      {state === 'error' && (
        <p role="alert" className="mt-4 rounded-lg bg-accent-100 p-3 text-sm text-accent-800">
          {error}
        </p>
      )}

      {meals.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {meals.map((meal, i) => (
            <li key={i} className="rounded-lg bg-bg p-4">
              <h3 className="font-heading text-[15px] text-ink">{meal.mealName}</h3>
              <p className="text-muted mt-0.5 text-xs">
                {meal.cuisine} · {meal.prepTimeMinutes} min
              </p>
              {meal.recipeUrl && (
                <a
                  href={meal.recipeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs font-semibold text-accent2-800 underline underline-offset-2 hover:text-accent2-600"
                >
                  View recipe ↗
                </a>
              )}
              {!meal.recipeUrl && linksPending && (
                <p className="text-muted mt-1 animate-pulse text-[11px]">Finding recipe…</p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {meal.expiringIngredients.slice(0, 3).map((ing) => (
                  <span
                    key={ing}
                    className="rounded-full bg-accent-200 px-2 py-0.5 text-[11px] font-semibold text-accent-800"
                  >
                    {withGroundedAmount(ing, groundedAmounts(meal))}
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
