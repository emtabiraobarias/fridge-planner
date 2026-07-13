'use client';
import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { MealRecommendation } from '../types/meal-recommendation';

interface PlacementContextValue {
  /** The meal currently being placed onto the calendar, or null when not in placement mode. */
  placing: MealRecommendation | null;
  startPlacing: (meal: MealRecommendation) => void;
  clearPlacing: () => void;
}

const PlacementContext = createContext<PlacementContextValue | null>(null);

export function PlacementProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [placing, setPlacing] = useState<MealRecommendation | null>(null);
  const startPlacing = useCallback((meal: MealRecommendation): void => setPlacing(meal), []);
  const clearPlacing = useCallback((): void => setPlacing(null), []);
  return (
    <PlacementContext.Provider value={{ placing, startPlacing, clearPlacing }}>
      {children}
    </PlacementContext.Provider>
  );
}

export function usePlacement(): PlacementContextValue {
  const ctx = useContext(PlacementContext);
  if (!ctx) throw new Error('usePlacement must be used within a PlacementProvider');
  return ctx;
}

export function usePlacementOptional(): PlacementContextValue | null {
  return useContext(PlacementContext);
}
