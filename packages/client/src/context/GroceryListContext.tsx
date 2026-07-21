'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type {
  GroceryList,
  AddGroceryItemPayload,
  PatchGroceryItemPayload,
  ResolvedPurchaseInput,
  CompleteItemPayload,
  CompleteResult,
} from '../types/grocery-list';
import {
  fetchGroceryList,
  generateGroceryList,
  addGroceryItem,
  patchGroceryItem,
  checkOffGroceryItem,
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
  purchaseItem: (itemId: string, resolvedPurchase?: ResolvedPurchaseInput) => Promise<void>;
  togglePurchased: (itemId: string, current: boolean) => Promise<void>;
  completeSession: (items?: CompleteItemPayload[]) => Promise<CompleteResult>;
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

  const purchaseItem = useCallback(
    async (itemId: string, resolvedPurchase?: ResolvedPurchaseInput): Promise<void> => {
      try {
        const updated = resolvedPurchase
          ? await checkOffGroceryItem(currentWeekStart, itemId, resolvedPurchase)
          : await checkOffGroceryItem(currentWeekStart, itemId);
        setGroceryList(updated);
      } catch (err) {
        if (err instanceof Error && err.message.includes(': 409')) {
          await refresh();
          return;
        }
        throw err;
      }
    },
    [currentWeekStart, refresh],
  );

  const togglePurchased = useCallback(
    async (itemId: string, current: boolean): Promise<void> => {
      try {
        const updated = current
          ? await patchGroceryItem(currentWeekStart, itemId, { isPurchased: false })
          : await checkOffGroceryItem(currentWeekStart, itemId);
        setGroceryList(updated);
      } catch (err) {
        // Spec 008 (research D7): an un-tick can fail either because the row is in the
        // wrong state (409, unchanged 007 case) or because it already shed off the
        // rolling list (404 — the row is gone). Both are "cannot reverse, refetch" with
        // no distinct UI branch, so they're handled identically here.
        if (err instanceof Error && (err.message.includes(': 409') || err.message.includes(': 404'))) {
          await refresh();
          return;
        }
        throw err;
      }
    },
    [currentWeekStart, refresh],
  );

  const completeSession = useCallback(
    async (items: CompleteItemPayload[] = []): Promise<CompleteResult> => {
      const result = await completeGroceryList(currentWeekStart, items);
      await refresh();
      return result;
    },
    [currentWeekStart, refresh],
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
        purchaseItem,
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
