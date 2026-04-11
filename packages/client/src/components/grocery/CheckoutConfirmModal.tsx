import { useState, useEffect } from 'react';
import type { GroceryListItem, CompleteItemPayload } from '../../types/grocery-list';

interface CheckoutConfirmModalProps {
  purchasedItems: GroceryListItem[];
  onConfirm: (items: CompleteItemPayload[]) => void;
  onClose: () => void;
}

interface ItemForm {
  itemId: string;
  name: string;
  quantity: string;
  unit: string;
  category: string;
  location: string;
  expiresAt: string;
}

export function CheckoutConfirmModal({
  purchasedItems,
  onConfirm,
  onClose,
}: CheckoutConfirmModalProps): React.JSX.Element {
  const [forms, setForms] = useState<ItemForm[]>([]);

  useEffect(() => {
    setForms(
      purchasedItems.map((item) => ({
        itemId: item._id,
        name: item.displayName,
        quantity: String(item.quantity),
        unit: item.unit === 'servings' ? 'count' : item.unit,
        category: item.category,
        location: 'fridge',
        expiresAt: '',
      })),
    );
  }, [purchasedItems]);

  function updateForm(index: number, field: keyof ItemForm, value: string): void {
    setForms((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, [field]: value };
      return next;
    });
  }

  function handleConfirm(): void {
    const items: CompleteItemPayload[] = forms.map((f) => ({
      itemId: f.itemId,
      name: f.name,
      quantity: parseFloat(f.quantity) || 1,
      unit: f.unit || 'count',
      category: f.category,
      location: f.location,
      expiresAt: f.expiresAt || undefined,
    }));
    onConfirm(items);
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') onClose();
  }

  if (purchasedItems.length === 0) return <></>;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add purchased items to inventory"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onKeyDown={handleKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Add to Inventory</h2>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            Review details and add your purchased items to inventory.
          </p>

          {forms.map((form, i) => (
            <div key={form.itemId} className="rounded-lg border border-gray-200 p-3 space-y-2">
              <p className="text-sm font-medium text-gray-800">{form.name}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-500">
                  Quantity
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.quantity}
                    onChange={(e) => updateForm(i, 'quantity', e.target.value)}
                    className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Unit
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => updateForm(i, 'unit', e.target.value)}
                    className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Location
                  <select
                    value={form.location}
                    onChange={(e) => updateForm(i, 'location', e.target.value)}
                    className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="fridge">Fridge</option>
                    <option value="freezer">Freezer</option>
                    <option value="pantry">Pantry</option>
                  </select>
                </label>
                <label className="text-xs text-gray-500">
                  Expires At (optional)
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => updateForm(i, 'expiresAt', e.target.value)}
                    className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add to Inventory
          </button>
        </div>
      </div>
    </div>
  );
}
