import { useState } from 'react';
import type { AddGroceryItemPayload, GroceryCategory } from '../../types/grocery-list';
import { GROCERY_CATEGORIES } from '../../types/grocery-list';

interface AddGroceryItemFormProps {
  onAdd: (payload: AddGroceryItemPayload) => void;
}

export function AddGroceryItemForm({ onAdd }: AddGroceryItemFormProps): React.JSX.Element {
  const [displayName, setDisplayName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('count');
  const [category, setCategory] = useState<GroceryCategory>('Other');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Item name is required');
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0) {
      setError('Quantity must be a non-negative number');
      return;
    }
    setError('');
    onAdd({ displayName: displayName.trim(), quantity: qty, unit, category, notes });
    setDisplayName('');
    setQuantity('1');
    setUnit('count');
    setNotes('');
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 mt-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Add Item Manually</h3>
      {error && (
        <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs font-medium text-gray-600">
          Item name *
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Olive Oil"
            required
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Quantity
          <input
            type="number"
            min="0"
            step="0.1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-gray-600">
          Unit
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="count, ml, g…"
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
        <label className="col-span-2 text-xs font-medium text-gray-600">
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as GroceryCategory)}
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
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
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </label>
      </div>
      <button
        type="submit"
        className="mt-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Add Item
      </button>
    </form>
  );
}
