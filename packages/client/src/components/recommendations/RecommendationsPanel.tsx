import { useState, useEffect, useRef } from 'react';
import { fetchRecommendations as fetchRecommendationsService } from '../../services/inventory';
import type { MealRecommendation } from '../../types/meal-recommendation';
import { useRecommendations } from '../../context/RecommendationsContext';
import { useInventory } from '../../context/InventoryContext';
import { DietaryPreferences } from './DietaryPreferences';
import { MealCard, MealCardSkeleton } from './MealCard';
import { DraggableMealCard } from './DraggableMealCard';

const STORAGE_KEY = 'fridge-planner:dietary-preferences';
const CLIENT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function loadPreferences(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as string[] : [];
  } catch {
    return [];
  }
}

interface Props {
  fetchRecommendations?: (preferences: string[]) => Promise<MealRecommendation[]>;
  draggable?: boolean;
}

export function RecommendationsPanel({ fetchRecommendations: fetchFn = fetchRecommendationsService, draggable = false }: Props): React.JSX.Element {
  const { state, meals, error, cachedAt, cachedPreferences, setLoading, setMeals, setError } = useRecommendations();
  const { items } = useInventory();
  const [preferences, setPreferences] = useState<string[]>(loadPreferences);
  const prefetchedRef = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // localStorage may be unavailable
    }
  }, [preferences]);

  // Prefetch when inventory first becomes non-empty
  useEffect(() => {
    if (items.length > 0 && state === 'idle' && !prefetchedRef.current) {
      prefetchedRef.current = true;
      void handleFetch();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length > 0]);

  async function handleFetch(): Promise<void> {
    const prefsKey = [...preferences].sort().join(',');
    const cachedPrefsKey = [...cachedPreferences].sort().join(',');
    const age = cachedAt !== null ? Date.now() - cachedAt : Infinity;
    const prefsMatch = prefsKey === cachedPrefsKey;

    // Fresh cache hit — skip the network call entirely
    if (meals.length > 0 && age < CLIENT_CACHE_TTL_MS && prefsMatch) {
      return;
    }

    // Stale cache — revalidate silently in the background without clearing existing meals
    if (meals.length > 0 && age >= CLIENT_CACHE_TTL_MS && prefsMatch) {
      try {
        const result = await fetchFn(preferences);
        setMeals(result, preferences);
      } catch {
        // Silently ignore background revalidation errors; stale data remains visible
      }
      return;
    }

    // Cold fetch or preferences changed
    setLoading();
    try {
      const result = await fetchFn(preferences);
      setMeals(result, preferences);
    } catch {
      setError('Could not load recommendations. Please try again.');
    }
  }

  return (
    <section aria-label="Meal recommendations" className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">AI Meal Recommendations</h2>

      <DietaryPreferences selected={preferences} onChange={setPreferences} />

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
