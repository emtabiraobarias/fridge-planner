'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { fetchRecommendations as fetchRecommendationsService, type RecommendationsResult } from '../../services/inventory';
import { useRecommendations } from '../../context/RecommendationsContext';
import { useInventory } from '../../context/InventoryContext';
import { usePlacement } from '../../context/PlacementContext';
import { MealCard, MealCardSkeleton } from './MealCard';
import type { MealRecommendation } from '../../types/meal-recommendation';

const CLIENT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const FALLBACK_NOTICE: Record<'popular' | 'cache', string> = {
  popular:
    'Personalised AI suggestions are unavailable right now — showing popular recipes. Add inventory items and try again for tailored picks.',
  cache: 'Showing your most recent suggestions — the AI is taking a while to refresh.',
};

interface Props {
  fetchRecommendations?: () => Promise<RecommendationsResult>;
}

export function RecommendationsPanel({
  fetchRecommendations: fetchFn = fetchRecommendationsService,
}: Props): React.JSX.Element {
  const { state, meals, error, cachedAt, fallback, setLoading, setMeals, setError } = useRecommendations();
  const { items } = useInventory();
  const { startPlacing } = usePlacement();
  const router = useRouter();
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
    if (meals.length > 0 && age < CLIENT_CACHE_TTL_MS) return;

    if (meals.length > 0 && age >= CLIENT_CACHE_TTL_MS) {
      try {
        const result = await fetchFn();
        setMeals(result.recommendations, result.fallback ?? null);
      } catch {
        // stale data remains visible
      }
      return;
    }

    setLoading();
    try {
      const result = await fetchFn();
      setMeals(result.recommendations, result.fallback ?? null);
    } catch {
      setError('Could not load recommendations. Please try again.');
    }
  }

  function handlePlan(meal: MealRecommendation): void {
    startPlacing(meal);
    router.push('/calendar');
  }

  const urgentNames = items
    .filter((i) => i.expirationStatus === 'expiring-soon' || i.expirationStatus === 'expired')
    .slice(0, 2)
    .map((i) => i.name.toLowerCase());
  const urgentSummary = urgentNames.length ? urgentNames.join(' and ') : 'freshest ingredients';

  function renderResults(): React.JSX.Element | null {
    if (state === 'loading') {
      return (
        <ul className="mt-4 space-y-3" aria-label="Loading meal recommendations">
          <MealCardSkeleton />
          <MealCardSkeleton />
          <MealCardSkeleton />
        </ul>
      );
    }
    if (state === 'error') {
      return (
        <p role="alert" className="mt-4 rounded-lg bg-accent-100 p-3 text-sm text-accent-800">
          {error}
        </p>
      );
    }
    if (state !== 'success') return null;
    return (
      <>
        {fallback && (
          <p role="status" className="mt-4 rounded-lg bg-accent-100 p-3 text-sm text-accent-800">
            {FALLBACK_NOTICE[fallback]}
          </p>
        )}
        {meals.length === 0 && (
          <p className="text-muted mt-4 text-sm">No suggestions returned — try adding more ingredients.</p>
        )}
        {meals.length > 0 && (
          <ul className="mt-4 space-y-3">
            {meals.map((meal, i) => (
              <MealCard key={i} meal={meal} onPlan={handlePlan} />
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <section aria-label="Meal recommendations" className="rounded-lg bg-surface p-6 shadow-sm">
      <p className="text-h6 font-body font-bold uppercase text-accent-700">From your fridge</p>
      <h2 className="font-heading text-h3 text-ink">What can I cook?</h2>
      <p className="text-muted mb-3 text-[13px]">Ideas that use up your {urgentSummary} first.</p>

      <button
        type="button"
        onClick={() => {
          void handleFetch();
        }}
        disabled={state === 'loading'}
        className="w-full rounded-full bg-accent px-4 py-2.5 font-semibold text-bg hover:bg-accent-600 disabled:opacity-60"
      >
        {state === 'loading' ? 'Thinking…' : 'Get Recommendations'}
      </button>

      {renderResults()}
    </section>
  );
}
