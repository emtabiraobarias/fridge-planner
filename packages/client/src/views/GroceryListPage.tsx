'use client';
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

interface ContentProps {
  items: GroceryListItem[];
  filteredItems: GroceryListItem[];
  categoriesWithItems: string[];
  purchasedItems: GroceryListItem[];
  search: string;
  generating: boolean;
  currentWeekStart: string;
  onSearch: (s: string) => void;
  onGenerate: () => void;
  onTogglePurchased: (id: string, cur: boolean) => Promise<void>;
  onUpdate: (id: string, payload: PatchGroceryItemPayload) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onAddItem: (payload: AddGroceryItemPayload) => Promise<void>;
  onComplete: (items: CompleteItemPayload[]) => Promise<void>;
}

function GroceryListContent({
  items, filteredItems, categoriesWithItems, purchasedItems,
  search, generating, currentWeekStart,
  onSearch, onGenerate, onTogglePurchased, onUpdate, onRemove, onAddItem, onComplete,
}: ContentProps): React.JSX.Element {
  const [showModal, setShowModal] = useState(false);
  const [completeError, setCompleteError] = useState('');

  async function handleComplete(completedItems: CompleteItemPayload[]): Promise<void> {
    setCompleteError('');
    try {
      await onComplete(completedItems);
      setShowModal(false);
    } catch (err) {
      setCompleteError(err instanceof Error ? err.message : 'An error occurred');
    }
  }

  return (
    <div>
      <GroceryListHeader
        weekStart={currentWeekStart}
        itemCount={items.length}
        purchasedCount={purchasedItems.length}
        onGenerate={() => { void onGenerate(); }}
        generating={generating}
      />

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <p className="text-sm text-gray-500">No grocery items yet.</p>
          <p className="mt-1 text-xs text-gray-400">
            Plan meals for this week and click Regenerate, or add items manually below.
          </p>
        </div>
      ) : (
        <>
          {items.length >= 5 && (
            <GroceryListSearchBar value={search} onChange={onSearch} />
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
              onTogglePurchased={(id, cur) => { void onTogglePurchased(id, cur); }}
              onUpdate={(id, payload) => { void onUpdate(id, payload); }}
              onRemove={(id) => { void onRemove(id); }}
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
      )}

      <AddGroceryItemForm onAdd={(payload) => { void onAddItem(payload); }} />

      {showModal && (
        <CheckoutConfirmModal
          purchasedItems={purchasedItems}
          onConfirm={(completedItems) => { void handleComplete(completedItems); }}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

export function GroceryListPage(): React.JSX.Element {
  const { groceryList, loading, error, generate, addItem, updateItem, removeItem, togglePurchased, completeSession } = useGroceryList();
  const { refresh: refreshInventory } = useInventory();
  const { currentWeekStart } = useMealPlan();

  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);

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

  async function handleComplete(completedItems: CompleteItemPayload[]): Promise<void> {
    const result = await completeSession(completedItems);
    await refreshInventory();
    if (result.errors.length > 0) {
      throw new Error(result.errors.join('; '));
    }
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

  return (
    <GroceryListContent
      items={items}
      filteredItems={filteredItems}
      categoriesWithItems={categoriesWithItems}
      purchasedItems={purchasedItems}
      search={search}
      generating={generating}
      currentWeekStart={currentWeekStart}
      onSearch={setSearch}
      onGenerate={handleGenerate}
      onTogglePurchased={togglePurchased}
      onUpdate={updateItem}
      onRemove={removeItem}
      onAddItem={addItem}
      onComplete={handleComplete}
    />
  );
}
