import { createContext, useContext, useState } from 'react';
import type { MealRecommendation } from '../types/meal-recommendation';

type RecommendationsState = 'idle' | 'loading' | 'success' | 'error';

interface RecommendationsContextValue {
  state: RecommendationsState;
  meals: MealRecommendation[];
  error: string;
  cachedAt: number | null;
  cachedPreferences: string[];
  setLoading: () => void;
  setMeals: (meals: MealRecommendation[], preferences: string[]) => void;
  setError: (message: string) => void;
}

const RecommendationsContext = createContext<RecommendationsContextValue | null>(null);

export function RecommendationsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, setState] = useState<RecommendationsState>('idle');
  const [meals, setMealsState] = useState<MealRecommendation[]>([]);
  const [error, setErrorState] = useState('');
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [cachedPreferences, setCachedPreferences] = useState<string[]>([]);

  function setLoading(): void {
    setState('loading');
    setErrorState('');
  }

  function setMeals(next: MealRecommendation[], preferences: string[]): void {
    setMealsState(next);
    setState('success');
    setCachedAt(Date.now());
    setCachedPreferences(preferences);
  }

  function setError(message: string): void {
    setErrorState(message);
    setState('error');
  }

  return (
    <RecommendationsContext.Provider value={{ state, meals, error, cachedAt, cachedPreferences, setLoading, setMeals, setError }}>
      {children}
    </RecommendationsContext.Provider>
  );
}

export function useRecommendations(): RecommendationsContextValue {
  const ctx = useContext(RecommendationsContext);
  if (!ctx) throw new Error('useRecommendations must be used within a RecommendationsProvider');
  return ctx;
}
