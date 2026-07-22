import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { InventoryItem, InventorySummary } from '../services/inventory';
import {
  type CreateItemPayload,
  type CreateItemResult,
  type InventoryItemUpdate,
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
  // Spec 009 US3: the resolved CreateItemResult (merged vs. created) is surfaced
  // to callers so a quick-add merge can trigger an Undo toast (FR-IR-012/013).
  addItem: (data: CreateItemPayload) => Promise<CreateItemResult>;
  editItem: (id: string, data: InventoryItemUpdate) => Promise<void>;
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

  const addItem = useCallback(async (data: CreateItemPayload): Promise<CreateItemResult> => {
    const result = await createItem(data);
    await refresh();
    return result;
  }, [refresh]);

  const editItem = useCallback(async (id: string, data: InventoryItemUpdate): Promise<void> => {
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
