import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { MealPlan, MealPlanEntry, MealType } from '../types/meal-plan';
import {
  fetchMealPlan,
  addEntry,
  removeEntry,
  replaceEntries,
  cookEntry,
  uncookEntry,
  type CookMealLine,
} from '../services/meal-plans';
import { getWeekStart } from '../lib/date-utils';

interface MealPlanContextValue {
  plan: MealPlan | null;
  loading: boolean;
  error: string;
  currentWeekStart: string;
  setWeekOffset: (offset: number) => void;
  assignMeal: (entry: Omit<MealPlanEntry, 'slotId'>) => Promise<void>;
  unassignMeal: (slotId: string) => Promise<void>;
  moveMeal: (slotId: string, newDate: string, newMealType: MealType) => Promise<void>;
  cookMeal: (slotId: string, consumption: CookMealLine[]) => Promise<void>;
  uncookMeal: (slotId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export type { MealPlanContextValue };
export const MealPlanContext = createContext<MealPlanContextValue | null>(null);

export function MealPlanProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [weekOffset, setWeekOffset] = useState(0);
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const currentWeekStart = getWeekStart(weekOffset);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchMealPlan(currentWeekStart);
      setPlan(data);
    } catch {
      setError('Failed to load meal plan');
    } finally {
      setLoading(false);
    }
  }, [currentWeekStart]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const assignMeal = useCallback(
    async (entry: Omit<MealPlanEntry, 'slotId'>): Promise<void> => {
      const slotId = crypto.randomUUID();
      await addEntry(currentWeekStart, { ...entry, slotId });
      await refresh();
    },
    [currentWeekStart, refresh],
  );

  const unassignMeal = useCallback(
    async (slotId: string): Promise<void> => {
      await removeEntry(currentWeekStart, slotId);
      await refresh();
    },
    [currentWeekStart, refresh],
  );

  const moveMeal = useCallback(
    async (slotId: string, newDate: string, newMealType: MealType): Promise<void> => {
      const currentEntries = plan?.entries ?? [];
      const updatedEntries = currentEntries.map((e) =>
        e.slotId === slotId ? { ...e, date: newDate, mealType: newMealType } : e,
      );
      await replaceEntries(currentWeekStart, updatedEntries);
      await refresh();
    },
    [plan, currentWeekStart, refresh],
  );

  const cookMeal = useCallback(
    async (slotId: string, consumption: CookMealLine[]): Promise<void> => {
      const result = await cookEntry(currentWeekStart, slotId, consumption);
      setPlan(result.plan);
    },
    [currentWeekStart],
  );

  const uncookMeal = useCallback(
    async (slotId: string): Promise<void> => {
      const updated = await uncookEntry(currentWeekStart, slotId);
      setPlan(updated);
    },
    [currentWeekStart],
  );

  return (
    <MealPlanContext.Provider
      value={{
        plan,
        loading,
        error,
        currentWeekStart,
        setWeekOffset,
        assignMeal,
        unassignMeal,
        moveMeal,
        cookMeal,
        uncookMeal,
        refresh,
      }}
    >
      {children}
    </MealPlanContext.Provider>
  );
}

export function useMealPlan(): MealPlanContextValue {
  const ctx = useContext(MealPlanContext);
  if (!ctx) throw new Error('useMealPlan must be used within a MealPlanProvider');
  return ctx;
}
