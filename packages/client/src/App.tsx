import { useState } from 'react';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { InventoryForm } from './components/inventory/InventoryForm';
import { InventoryList } from './components/inventory/InventoryList';
import { RecommendationsPanel } from './components/recommendations/RecommendationsPanel';
import type { InventoryItem } from './services/inventory';

function InventoryPage(): React.JSX.Element {
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
          item={editingItem}
          onSubmit={handleSubmit}
          onCancel={editingItem ? (): void => setEditingItem(undefined) : undefined}
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

export default function App(): React.JSX.Element {
  return (
    <InventoryProvider>
      <main className="min-h-screen bg-gray-50">
        <header className="border-b border-gray-200 bg-white px-4 py-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Fridge Planner</h1>
        </header>
        <div className="max-w-6xl mx-auto px-4 pb-8">
          <InventoryPage />
        </div>
      </main>
    </InventoryProvider>
  );
}
