'use client';
import type { ReactNode } from 'react';
import { InventoryProvider } from '../src/context/InventoryContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { RecommendationsProvider } from '../src/context/RecommendationsContext';
import { AuthBanner } from '../src/components/shared/AuthBanner';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps): React.JSX.Element {
  return (
    <InventoryProvider>
      <MealPlanProvider>
        <RecommendationsProvider>
          <AuthBanner />
          {children}
        </RecommendationsProvider>
      </MealPlanProvider>
    </InventoryProvider>
  );
}
