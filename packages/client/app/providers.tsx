'use client';
import type { ReactNode } from 'react';
import { AuthProvider } from '../src/context/AuthContext';
import { InventoryProvider } from '../src/context/InventoryContext';
import { MealPlanProvider } from '../src/context/MealPlanContext';
import { RecommendationsProvider } from '../src/context/RecommendationsContext';
import { PlacementProvider } from '../src/context/PlacementContext';
import { QuickAddProvider } from '../src/context/QuickAddContext';
import { ToastProvider } from '../src/context/ToastContext';
import { AuthBanner } from '../src/components/shared/AuthBanner';
import { Toast } from '../src/components/shared/Toast';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps): React.JSX.Element {
  return (
    <AuthProvider>
      <ToastProvider>
        <InventoryProvider>
          <MealPlanProvider>
            <RecommendationsProvider>
              <PlacementProvider>
                <QuickAddProvider>
                  <AuthBanner />
                  {children}
                  <Toast />
                </QuickAddProvider>
              </PlacementProvider>
            </RecommendationsProvider>
          </MealPlanProvider>
        </InventoryProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
