'use client';
import { useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import { InventoryForm } from '../components/inventory/InventoryForm';
import { InventoryList } from '../components/inventory/InventoryList';
import { RecommendationsPanel } from '../components/recommendations/RecommendationsPanel';
import type { InventoryItem } from '../services/inventory';

export function InventoryPage(): React.JSX.Element {
  const { items, summary, loading, error, addItem, editItem, removeItem } = useInventory();
  const [editingItem, setEditingItem] = useState<InventoryItem | undefined>();

  async function handleSubmit(data: Omit<InventoryItem, '_id' | 'expirationStatus'>): Promise<void> {
    if (editingItem) {
      await editItem(editingItem._id, data);
      setEditingItem(undefined);
    } else {
      await addItem(data);
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <InventoryForm
          {...(editingItem !== undefined ? { item: editingItem } : {})}
          onSubmit={handleSubmit}
          {...(editingItem !== undefined ? { onCancel: (): void => setEditingItem(undefined) } : {})}
        />

        {loading && <p className="text-sm text-gray-500 animate-pulse">Loading inventory…</p>}

        {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>}

        {!loading && (
          <div>
            <div className="flex gap-3 mb-3 text-xs">
              <span className="rounded-full bg-gray-100 px-2 py-1">{summary.total} items</span>
              {summary.expiringSoon > 0 && (
                <span className="rounded-full bg-yellow-100 text-yellow-800 px-2 py-1">{summary.expiringSoon} expiring soon</span>
              )}
              {summary.expired > 0 && (
                <span className="rounded-full bg-red-100 text-red-800 px-2 py-1">{summary.expired} expired</span>
              )}
            </div>
            <InventoryList items={items} onDelete={removeItem} onEdit={setEditingItem} />
          </div>
        )}
      </div>

      <div>
        <RecommendationsPanel />
      </div>
    </div>
  );
}
