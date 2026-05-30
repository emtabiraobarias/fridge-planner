'use client';
import type { ReactNode } from 'react';
import { InventoryProvider } from '../src/context/InventoryContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { RecommendationsProvider } from '../src/context/RecommendationsContext';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps): React.JSX.Element {
  return (
    <InventoryProvider>
      <MealPlanProvider>
        <RecommendationsProvider>
          {children}
        </RecommendationsProvider>
      </MealPlanProvider>
    </InventoryProvider>
  );
}
