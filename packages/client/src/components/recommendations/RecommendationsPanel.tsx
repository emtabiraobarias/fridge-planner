import { useEffect, useRef } from 'react';
import { fetchRecommendations as fetchRecommendationsService } from '../../services/inventory';
import type { MealRecommendation } from '../../types/meal-recommendation';
import { useRecommendations } from '../../context/RecommendationsContext';
import { useInventory } from '../../context/InventoryContext';
import { MealCard, MealCardSkeleton } from './MealCard';
import { DraggableMealCard } from './DraggableMealCard';

const CLIENT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface Props {
  fetchRecommendations?: () => Promise<MealRecommendation[]>;
  draggable?: boolean;
}

export function RecommendationsPanel({ fetchRecommendations: fetchFn = fetchRecommendationsService, draggable = false }: Props): React.JSX.Element {
  const { state, meals, error, cachedAt, setLoading, setMeals, setError } = useRecommendations();
  const { items } = useInventory();
  const prefetchedRef = useRef(false);

  // Prefetch when inventory first becomes non-empty
  useEffect(() => {
    if (items.length > 0 && state === 'idle' && !prefetchedRef.current) {
      prefetchedRef.current = true;
      void handleFetch();
    }
  }, [items.length > 0]); // dep is a boolean: fires only when inventory transitions from empty to non-empty

  async function handleFetch(): Promise<void> {
    const age = cachedAt !== null ? Date.now() - cachedAt : Infinity;

    // Fresh cache hit — skip the network call entirely
    if (meals.length > 0 && age < CLIENT_CACHE_TTL_MS) {
      return;
    }

    // Stale cache — revalidate silently in the background without clearing existing meals
    if (meals.length > 0 && age >= CLIENT_CACHE_TTL_MS) {
      try {
        const result = await fetchFn();
        setMeals(result);
      } catch {
        // Silently ignore background revalidation errors; stale data remains visible
      }
      return;
    }

    // Cold fetch
    setLoading();
    try {
      const result = await fetchFn();
      setMeals(result);
    } catch {
      setError('Could not load recommendations. Please try again.');
    }
  }

  return (
    <section aria-label="Meal recommendations" className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">AI Meal Recommendations</h2>

      <button
        onClick={() => { void handleFetch(); }}
        disabled={state === 'loading'}
        className="w-full rounded-lg bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === 'loading' ? 'Thinking…' : 'Get Recommendations'}
      </button>

      {state === 'loading' && (
        <ul className="mt-4 space-y-3" aria-label="Loading meal recommendations">
          <MealCardSkeleton />
          <MealCardSkeleton />
          <MealCardSkeleton />
        </ul>
      )}

      {state === 'error' && (
        <p role="alert" className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg p-3">
          {error}
        </p>
      )}

      {state === 'success' && meals.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">
          No suggestions returned — try adding more ingredients.
        </p>
      )}

      {state === 'success' && meals.length > 0 && (
        <ul className="mt-4 space-y-3">
          {meals.map((meal, i) =>
            draggable ? (
              <DraggableMealCard key={i} meal={meal} index={i} />
            ) : (
              <MealCard key={i} meal={meal} />
            ),
          )}
        </ul>
      )}
    </section>
  );
}
