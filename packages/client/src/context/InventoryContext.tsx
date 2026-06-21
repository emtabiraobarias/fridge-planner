import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { InventoryItem, InventorySummary } from '../services/inventory';
import {
  fetchInventory,
  createItem,
  updateItem,
  deleteItem,
} from '../services/inventory';

interface InventoryContextValue {
  items: InventoryItem[];
  summary: InventorySummary;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  addItem: (data: Omit<InventoryItem, '_id' | 'expirationStatus'>) => Promise<void>;
  editItem: (id: string, data: Partial<Omit<InventoryItem, '_id' | 'expirationStatus'>>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

const EMPTY_SUMMARY: InventorySummary = { total: 0, expired: 0, expiringSoon: 0 };

export function InventoryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchInventory();
      setItems(data.items);
      setSummary(data.summary);
    } catch {
      setError('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItem = useCallback(async (data: Omit<InventoryItem, '_id' | 'expirationStatus'>): Promise<void> => {
    await createItem(data);
    await refresh();
  }, [refresh]);

  const editItem = useCallback(async (id: string, data: Partial<Omit<InventoryItem, '_id' | 'expirationStatus'>>): Promise<void> => {
    await updateItem(id, data);
    await refresh();
  }, [refresh]);

  const removeItem = useCallback(async (id: string): Promise<void> => {
    await deleteItem(id);
    await refresh();
  }, [refresh]);

  return (
    <InventoryContext.Provider value={{ items, summary, loading, error, refresh, addItem, editItem, removeItem }}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory(): InventoryContextValue {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error('useInventory must be used within an InventoryProvider');
  return ctx;
}

/** Non-throwing variant — returns null when used outside a provider (e.g. presentational tests). */
export function useInventoryOptional(): InventoryContextValue | null {
  return useContext(InventoryContext);
}
