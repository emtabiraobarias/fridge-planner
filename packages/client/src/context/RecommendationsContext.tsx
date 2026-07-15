import { createContext, useContext, useState } from 'react';
import { fetchRecipeLinks } from '../services/inventory';
import type { MealRecommendation } from '../types/meal-recommendation';

type RecommendationsState = 'idle' | 'loading' | 'success' | 'error';
type Fallback = 'popular' | 'cache' | null;

interface RecommendationsContextValue {
  state: RecommendationsState;
  meals: MealRecommendation[];
  error: string;
  cachedAt: number | null;
  /** Non-null when the shown meals are a server fallback, not personalised AI results. */
  fallback: Fallback;
  /** FR-037 lazy phase in flight — meals are shown, links still being verified. */
  linksPending: boolean;
  setLoading: () => void;
  setMeals: (meals: MealRecommendation[], fallback?: Fallback) => void;
  setError: (message: string) => void;
  /**
   * FR-037 lazy phase: verify links for freshly-fetched (non-fallback) meals, attach
   * them as they arrive, then remove any meal left without a verified link. Surfaces
   * a notice when verification is unavailable or nothing could be verified.
   */
  checkLinks: (meals: MealRecommendation[]) => Promise<void>;
}

const RecommendationsContext = createContext<RecommendationsContextValue | null>(null);

const UNAVAILABLE_MSG =
  'Recipe links could not be verified right now (verification unavailable) — suggestions were withheld rather than shown without recipes. Try again later.';
const NONE_VERIFIED_MSG =
  'No recipe link could be verified for any suggested meal — try requesting suggestions again.';

export function RecommendationsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState<RecommendationsState>('idle');
  const [meals, setMealsState] = useState<MealRecommendation[]>([]);
  const [error, setErrorState] = useState('');
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [fallback, setFallbackState] = useState<Fallback>(null);
  const [linksPending, setLinksPending] = useState(false);

  function setLoading(): void {
    setState('loading');
    setErrorState('');
  }

  function setMeals(next: MealRecommendation[], nextFallback: Fallback = null): void {
    setMealsState(next);
    setFallbackState(nextFallback);
    setState('success');
    setCachedAt(Date.now());
  }

  function setError(message: string): void {
    setErrorState(message);
    setState('error');
  }

  async function checkLinks(fresh: MealRecommendation[]): Promise<void> {
    const names = fresh.filter((m) => !m.recipeUrl).map((m) => m.mealName);
    if (names.length === 0) return;

    setLinksPending(true);
    try {
      const { links, available } = await fetchRecipeLinks(names.slice(0, 10));
      if (!available) {
        setMealsState([]);
        setError(UNAVAILABLE_MSG);
        return;
      }
      // Merge verified links into the just-fetched list, then drop still-unlinked
      // meals (FR-037: the list settles to linked-only).
      const settled = fresh
        .map((m) => (links[m.mealName] ? { ...m, ...links[m.mealName] } : m))
        .filter((m) => Boolean(m.recipeUrl));
      setMealsState(settled);
      if (settled.length === 0) setError(NONE_VERIFIED_MSG);
    } catch {
      // Treat a failed lazy phase like unavailability: never leave unlinked meals up.
      setMealsState([]);
      setError(UNAVAILABLE_MSG);
    } finally {
      setLinksPending(false);
    }
  }

  return (
    <RecommendationsContext.Provider
      value={{ state, meals, error, cachedAt, fallback, linksPending, setLoading, setMeals, setError, checkLinks }}
    >
      {children}
    </RecommendationsContext.Provider>
  );
}

export function useRecommendations(): RecommendationsContextValue {
  const ctx = useContext(RecommendationsContext);
  if (!ctx) throw new Error('useRecommendations must be used within a RecommendationsProvider');
  return ctx;
}
