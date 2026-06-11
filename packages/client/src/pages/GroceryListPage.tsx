import { useState } from 'react';
import { useGroceryList } from '../context/GroceryListContext';
import { useInventory } from '../context/InventoryContext';
import { useMealPlan } from '../context/MealPlanContext';
import { GroceryListHeader } from '../components/grocery/GroceryListHeader';
import { GroceryListSearchBar } from '../components/grocery/GroceryListSearchBar';
import { GroceryListCategoryGroup } from '../components/grocery/GroceryListCategoryGroup';
import { AddGroceryItemForm } from '../components/grocery/AddGroceryItemForm';
import { CheckoutConfirmModal } from '../components/grocery/CheckoutConfirmModal';
import type {
  GroceryCategory,
  GroceryListItem,
  AddGroceryItemPayload,
  PatchGroceryItemPayload,
  CompleteItemPayload,
} from '../types/grocery-list';
import { GROCERY_CATEGORIES } from '../types/grocery-list';

export function GroceryListPage(): React.JSX.Element {
  const { groceryList, loading, error, generate, addItem, updateItem, removeItem, togglePurchased, completeSession } = useGroceryList();
  const { refresh: refreshInventory } = useInventory();
  const { currentWeekStart } = useMealPlan();

  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [completeError, setCompleteError] = useState('');

  const items = groceryList?.items ?? [];
  const purchasedItems = items.filter((i) => i.isPurchased);

  const filteredItems = search.trim()
    ? items.filter((i) =>
        i.displayName.toLowerCase().includes(search.toLowerCase()) ||
        i.notes.toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  const categoriesWithItems = GROCERY_CATEGORIES.filter((cat) =>
    filteredItems.some((i) => i.category === cat),
  );

  async function handleGenerate(): Promise<void> {
    setGenerating(true);
    try {
      await generate();
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddItem(payload: AddGroceryItemPayload): Promise<void> {
    await addItem(payload);
  }

  async function handleTogglePurchased(itemId: string, current: boolean): Promise<void> {
    await togglePurchased(itemId, current);
  }

  async function handleUpdateItem(itemId: string, payload: PatchGroceryItemPayload): Promise<void> {
    await updateItem(itemId, payload);
  }

  async function handleRemoveItem(itemId: string): Promise<void> {
    await removeItem(itemId);
  }

  async function handleCompleteSession(items: CompleteItemPayload[]): Promise<void> {
    setCompleteError('');
    const result = await completeSession(items);
    if (result.errors.length > 0) {
      setCompleteError(result.errors.join('; '));
    }
    await refreshInventory();
    setShowModal(false);
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 py-8">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-12 rounded-lg bg-gray-200" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
        {error}
      </p>
    );
  }

  // Extracted so the conditional list markup counts against this helper's
  // cyclomatic complexity rather than the component's (lint: complexity <= 10).
  function renderBody(): React.JSX.Element {
    if (items.length === 0) {
      return (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <p className="text-sm text-gray-500">No grocery items yet.</p>
          <p className="mt-1 text-xs text-gray-400">
            Plan meals for this week and click Regenerate, or add items manually below.
          </p>
        </div>
      );
    }
    return (
      <>
        {items.length >= 5 && (
          <GroceryListSearchBar value={search} onChange={setSearch} />
        )}

        {filteredItems.length === 0 && search.trim() && (
          <p className="py-4 text-center text-sm text-gray-400">
            No items match &ldquo;{search}&rdquo;
          </p>
        )}

        {categoriesWithItems.map((cat) => (
          <GroceryListCategoryGroup
            key={cat}
            category={cat as GroceryCategory}
            items={filteredItems.filter((i) => i.category === cat) as GroceryListItem[]}
            onTogglePurchased={(id, cur) => { void handleTogglePurchased(id, cur); }}
            onUpdate={(id, payload) => { void handleUpdateItem(id, payload); }}
            onRemove={(id) => { void handleRemoveItem(id); }}
          />
        ))}

        {purchasedItems.length > 0 && (
          <div className="mt-4">
            {completeError && (
              <p role="alert" className="mb-2 text-sm text-red-600">{completeError}</p>
            )}
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Complete Shopping ({purchasedItems.length} items)
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      <GroceryListHeader
        weekStart={currentWeekStart}
        itemCount={items.length}
        purchasedCount={purchasedItems.length}
        onGenerate={() => { void handleGenerate(); }}
        generating={generating}
      />

      {renderBody()}

      <AddGroceryItemForm onAdd={(payload) => { void handleAddItem(payload); }} />

      {showModal && (
        <CheckoutConfirmModal
          purchasedItems={purchasedItems}
          onConfirm={(items) => { void handleCompleteSession(items); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
