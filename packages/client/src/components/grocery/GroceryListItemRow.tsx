import { useState } from 'react';
import type { GroceryListItem, GroceryCategory, PatchGroceryItemPayload } from '../../types/grocery-list';
import { GROCERY_CATEGORIES } from '../../types/grocery-list';

interface GroceryListItemRowProps {
  item: GroceryListItem;
  onTogglePurchased: (itemId: string, current: boolean) => void;
  onUpdate: (itemId: string, payload: PatchGroceryItemPayload) => void;
  onRemove: (itemId: string) => void;
}

export function GroceryListItemRow({
  item,
  onTogglePurchased,
  onUpdate,
  onRemove,
}: GroceryListItemRowProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [editQuantity, setEditQuantity] = useState(String(item.quantity));
  const [editUnit, setEditUnit] = useState(item.unit);
  const [editCategory, setEditCategory] = useState<GroceryCategory>(item.category);
  const [editNotes, setEditNotes] = useState(item.notes);

  function handleSave(): void {
    onUpdate(item._id, {
      quantity: parseFloat(editQuantity) || item.quantity,
      unit: editUnit,
      category: editCategory,
      notes: editNotes,
    });
    setEditing(false);
  }

  return (
    <li className={`flex flex-col gap-1 py-2 ${item.isPurchased ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          aria-label={`Mark ${item.displayName} as purchased`}
          checked={item.isPurchased}
          onChange={() => onTogglePurchased(item._id, item.isPurchased)}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600"
        />
        <span
          className={`flex-1 text-sm font-medium ${
            item.isPurchased ? 'line-through text-gray-400' : 'text-gray-900'
          }`}
        >
          {item.displayName}
        </span>
        <span className="text-sm text-gray-500">
          {item.quantity} {item.unit}
        </span>
        <button
          type="button"
          aria-label={`Edit ${item.displayName}`}
          onClick={() => setEditing((v) => !v)}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          ✏️
        </button>
        <button
          type="button"
          aria-label={`Remove ${item.displayName}`}
          onClick={() => onRemove(item._id)}
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
        >
          ✕
        </button>
      </div>

      {item.sourceMealNames.length > 0 && (
        <p className="ml-7 text-xs text-gray-400">
          From: {item.sourceMealNames.join(', ')}
        </p>
      )}

      {editing && (
        <div className="ml-7 mt-1 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3">
          <label className="col-span-2 text-xs font-medium text-gray-600">
            Quantity
            <input
              type="number"
              min="0"
              step="0.1"
              value={editQuantity}
              onChange={(e) => setEditQuantity(e.target.value)}
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-gray-600">
            Unit
            <input
              type="text"
              value={editUnit}
              onChange={(e) => setEditUnit(e.target.value)}
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-gray-600">
            Category
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value as GroceryCategory)}
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            >
              {GROCERY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2 text-xs font-medium text-gray-600">
            Notes
            <input
              type="text"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <div className="col-span-2 flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
