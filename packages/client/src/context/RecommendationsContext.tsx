import { createContext, useContext, useState } from 'react';
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
  setLoading: () => void;
  setMeals: (meals: MealRecommendation[], fallback?: Fallback) => void;
  setError: (message: string) => void;
}

const RecommendationsContext = createContext<RecommendationsContextValue | null>(null);

export function RecommendationsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState<RecommendationsState>('idle');
  const [meals, setMealsState] = useState<MealRecommendation[]>([]);
  const [error, setErrorState] = useState('');
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [fallback, setFallbackState] = useState<Fallback>(null);

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

  return (
    <RecommendationsContext.Provider value={{ state, meals, error, cachedAt, fallback, setLoading, setMeals, setError }}>
      {children}
    </RecommendationsContext.Provider>
  );
}

export function useRecommendations(): RecommendationsContextValue {
  const ctx = useContext(RecommendationsContext);
  if (!ctx) throw new Error('useRecommendations must be used within a RecommendationsProvider');
  return ctx;
}
