'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type {
  GroceryList,
  AddGroceryItemPayload,
  PatchGroceryItemPayload,
  CompleteItemPayload,
  CompleteResult,
} from '../types/grocery-list';
import {
  fetchGroceryList,
  generateGroceryList,
  addGroceryItem,
  patchGroceryItem,
  deleteGroceryItem,
  completeGroceryList,
} from '../services/grocery-lists';
import { useMealPlan } from './MealPlanContext';

interface GroceryListContextValue {
  groceryList: GroceryList | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  generate: () => Promise<void>;
  addItem: (payload: AddGroceryItemPayload) => Promise<void>;
  updateItem: (itemId: string, payload: PatchGroceryItemPayload) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  togglePurchased: (itemId: string, current: boolean) => Promise<void>;
  completeSession: (items: CompleteItemPayload[]) => Promise<CompleteResult>;
}

export const GroceryListContext = createContext<GroceryListContextValue | null>(null);

export function GroceryListProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { currentWeekStart } = useMealPlan();
  const [groceryList, setGroceryList] = useState<GroceryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchGroceryList(currentWeekStart);
      setGroceryList(data);
    } catch {
      setError('Failed to load grocery list');
    } finally {
      setLoading(false);
    }
  }, [currentWeekStart]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const data = await generateGroceryList(currentWeekStart);
      setGroceryList(data);
    } catch {
      setError('Failed to generate grocery list');
    } finally {
      setLoading(false);
    }
  }, [currentWeekStart]);

  const addItem = useCallback(
    async (payload: AddGroceryItemPayload): Promise<void> => {
      const updated = await addGroceryItem(currentWeekStart, payload);
      setGroceryList(updated);
    },
    [currentWeekStart],
  );

  const updateItem = useCallback(
    async (itemId: string, payload: PatchGroceryItemPayload): Promise<void> => {
      const updated = await patchGroceryItem(currentWeekStart, itemId, payload);
      setGroceryList(updated);
    },
    [currentWeekStart],
  );

  const removeItem = useCallback(
    async (itemId: string): Promise<void> => {
      const updated = await deleteGroceryItem(currentWeekStart, itemId);
      setGroceryList(updated);
    },
    [currentWeekStart],
  );

  const togglePurchased = useCallback(
    async (itemId: string, current: boolean): Promise<void> => {
      const updated = await patchGroceryItem(currentWeekStart, itemId, {
        isPurchased: !current,
      });
      setGroceryList(updated);
    },
    [currentWeekStart],
  );

  const completeSession = useCallback(
    async (items: CompleteItemPayload[]): Promise<CompleteResult> => {
      return completeGroceryList(currentWeekStart, items);
    },
    [currentWeekStart],
  );

  return (
    <GroceryListContext.Provider
      value={{
        groceryList,
        loading,
        error,
        refresh,
        generate,
        addItem,
        updateItem,
        removeItem,
        togglePurchased,
        completeSession,
      }}
    >
      {children}
    </GroceryListContext.Provider>
  );
}

export function useGroceryList(): GroceryListContextValue {
  const ctx = useContext(GroceryListContext);
  if (!ctx) throw new Error('useGroceryList must be used within a GroceryListProvider');
  return ctx;
}
