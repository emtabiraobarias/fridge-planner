'use client';
import { useRouter } from 'next/navigation';
import {
  fetchRecommendations as fetchRecommendationsService,
  recommendationsErrorMessage,
  type RecommendationsResult,
} from '../../services/inventory';
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
  fetchRecommendations?: (ingredientItemIds?: string[]) => Promise<RecommendationsResult>;
  /**
   * Spec 009 US2 (FR-IR-007): an optional ingredient scope from Kitchen select mode
   * (`InventoryPage`). When non-empty, the single contextual action relabels to
   * "Find recipes with selected" and threads the ids into the same service call —
   * one code path, one endpoint (research D3/D5).
   */
  ingredientItemIds?: string[];
}

export function RecommendationsPanel({
  fetchRecommendations: fetchFn = fetchRecommendationsService,
  ingredientItemIds,
}: Props): React.JSX.Element {
  const { state, meals, error, cachedAt, fallback, linksPending, setLoading, setMeals, setError, checkLinks } =
    useRecommendations();
  const { items } = useInventory();
  const { startPlacing } = usePlacement();
  const router = useRouter();

  // Spec 009 IR1 (FR-IR-001): no prefetch on mount — "Get Recommendations" is the
  // sole trigger. Session persistence (FR-IR-003) needs no effect here: results
  // live in the app-level RecommendationsProvider and `handleFetch` below already
  // short-circuits when fresh results exist.

  const scoped = ingredientItemIds !== undefined && ingredientItemIds.length > 0;

  // Fetch → show immediately → kick off the FR-037 lazy link phase (fallback sets
  // already carry pre-verified links, so they skip it).
  async function fetchAndApply(): Promise<void> {
    const result = await fetchFn(scoped ? ingredientItemIds : undefined);
    setMeals(result.recommendations, result.fallback ?? null);
    if (!result.fallback) void checkLinks(result.recommendations);
  }

  async function handleFetch(): Promise<void> {
    // A scoped request always re-fetches — the server's per-selection cache (D2)
    // dedupes, and a new selection must not be masked by stale whole-inventory
    // results still fresh in the client TTL.
    const age = cachedAt !== null ? Date.now() - cachedAt : Infinity;
    if (!scoped && meals.length > 0 && age < CLIENT_CACHE_TTL_MS) return;

    if (!scoped && meals.length > 0 && age >= CLIENT_CACHE_TTL_MS) {
      try {
        await fetchAndApply();
      } catch {
        // stale data remains visible
      }
      return;
    }

    setLoading();
    try {
      await fetchAndApply();
    } catch (err) {
      // Prefer the server's Problem JSON detail (e.g. FR-037's "recipe verification
      // unavailable") over a generic message, so the user knows what actually failed.
      setError(recommendationsErrorMessage(err, 'Could not load recommendations. Please try again.'));
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
    if (state === 'idle' && meals.length === 0) {
      return (
        <p className="text-muted mt-4 text-sm">
          Ready when you are — tap Get Recommendations for meal ideas using what&rsquo;s in your fridge.
        </p>
      );
    }
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
              <MealCard key={i} meal={meal} onPlan={handlePlan} linkPending={linksPending} />
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
        {state === 'loading' ? 'Thinking…' : scoped ? 'Find recipes with selected' : 'Get Recommendations'}
      </button>

      {renderResults()}
    </section>
  );
}
