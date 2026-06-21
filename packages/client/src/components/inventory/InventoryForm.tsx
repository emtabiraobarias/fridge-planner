import { useState } from 'react';
import type { InventoryItem, Category, Location } from '../../services/inventory';
import { useInventoryOptional } from '../../context/InventoryContext';

type NewItemData = Omit<InventoryItem, '_id' | 'expirationStatus'>;

const CATEGORIES: Category[] = ['Produce', 'Dairy', 'Meat', 'Seafood', 'Grains', 'Pantry', 'Condiments', 'Frozen', 'Other'];
const LOCATIONS: Location[] = ['fridge', 'freezer', 'pantry'];

interface Props {
  item?: InventoryItem;
  onSubmit: (data: Omit<InventoryItem, '_id' | 'expirationStatus'>) => Promise<void>;
  onCancel?: () => void;
}

interface FormErrors {
  name?: string;
  quantity?: string;
  unit?: string;
}

interface FormState {
  name: string;
  quantity: string;
  unit: string;
  category: Category;
  location: Location;
  expiresAt: string;
}

const INPUT_CLASS = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500';

const EMPTY_STATE: FormState = {
  name: '',
  quantity: '',
  unit: '',
  category: 'Other',
  location: 'fridge',
  expiresAt: '',
};

function stateFromItem(item: InventoryItem): FormState {
  return {
    name: item.name,
    quantity: item.quantity.toString(),
    unit: item.unit,
    category: item.category,
    location: item.location,
    expiresAt: item.expiresAt?.split('T')[0] ?? '',
  };
}

function initialState(item?: InventoryItem): FormState {
  return item ? stateFromItem(item) : EMPTY_STATE;
}

function validate(state: FormState): FormErrors {
  const errs: FormErrors = {};
  if (!state.name.trim()) errs.name = 'Name is required';
  const qty = Number(state.quantity);
  if (!state.quantity.trim() || qty < 0 || isNaN(qty)) errs.quantity = 'Quantity must be a non-negative number';
  if (!state.unit.trim()) errs.unit = 'Unit is required';
  return errs;
}

function TextInput({ id, label, value, onChange, error }: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; error?: string | undefined;
}): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        className={INPUT_CLASS}
      />
      {error && <p id={`${id}-err`} className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function NumberInput({ id, label, value, onChange, error }: {
  id: string; label: string; value: string;
  onChange: (v: string) => void; error?: string | undefined;
}): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        id={id}
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        className={INPUT_CLASS}
      />
      {error && <p id={`${id}-err`} className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

export function InventoryForm({ item, onSubmit, onCancel }: Props): React.JSX.Element {
  const [state, setState] = useState<FormState>(() => initialState(item));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const inventory = useInventoryOptional();
  const [duplicate, setDuplicate] = useState<{ data: NewItemData; existing: InventoryItem } | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  function buildData(): NewItemData {
    return {
      name: state.name.trim(),
      quantity: Number(state.quantity),
      unit: state.unit.trim(),
      category: state.category,
      location: state.location,
      ...(state.expiresAt ? { expiresAt: new Date(state.expiresAt).toISOString() } : {}),
    };
  }

  async function submitNew(data: NewItemData): Promise<void> {
    setSubmitting(true);
    try {
      await onSubmit(data);
      if (!item) setState(initialState());
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const errs = validate(state);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const data = buildData();
    // EC-03: when ADDING an ingredient that already exists, prompt to merge or add separately.
    const existing = item
      ? undefined
      : inventory?.items.find((i) => i.name.trim().toLowerCase() === data.name.toLowerCase());
    if (existing) {
      setDuplicate({ data, existing });
      return;
    }
    await submitNew(data);
  }

  async function confirmMerge(): Promise<void> {
    if (!duplicate || !inventory) return;
    const { data, existing } = duplicate;
    setSubmitting(true);
    try {
      await inventory.editItem(existing._id, { quantity: existing.quantity + data.quantity });
      setState(initialState());
      setDuplicate(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmSeparate(): Promise<void> {
    if (!duplicate) return;
    const { data } = duplicate;
    setDuplicate(null);
    await submitNew(data);
  }

  const isEdit = Boolean(item);
  const unitsMatch = duplicate
    ? duplicate.existing.unit.trim().toLowerCase() === duplicate.data.unit.toLowerCase()
    : false;

  return (
    <>
    <form onSubmit={(e): void => { void handleSubmit(e); }} aria-label={isEdit ? 'Edit ingredient' : 'Add ingredient'} className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{isEdit ? 'Edit Ingredient' : 'Add Ingredient'}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextInput id="inv-name" label="Name" value={state.name} onChange={(v) => update('name', v)} error={errors.name} />

        <div className="grid grid-cols-2 gap-3">
          <NumberInput id="inv-qty" label="Quantity" value={state.quantity} onChange={(v) => update('quantity', v)} error={errors.quantity} />
          <TextInput id="inv-unit" label="Unit" value={state.unit} onChange={(v) => update('unit', v)} error={errors.unit} />
        </div>

        <div>
          <label htmlFor="inv-category" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select id="inv-category" value={state.category} onChange={(e) => update('category', e.target.value as Category)} className={INPUT_CLASS}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="inv-location" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <select id="inv-location" value={state.location} onChange={(e) => update('location', e.target.value as Location)} className={INPUT_CLASS}>
            {LOCATIONS.map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="inv-expires" className="block text-sm font-medium text-gray-700 mb-1">Expires (optional)</label>
          <input id="inv-expires" type="date" value={state.expiresAt} onChange={(e) => update('expiresAt', e.target.value)} className={INPUT_CLASS} />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white font-medium hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving\u2026' : isEdit ? 'Update' : 'Add'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        )}
      </div>
    </form>

    {duplicate && (
      <div role="dialog" aria-label="Duplicate ingredient" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <p className="text-sm text-gray-800">
          <strong>{duplicate.existing.name}</strong> is already in your inventory ({duplicate.existing.quantity}{' '}
          {duplicate.existing.unit}). Merge the quantities, or add this as a separate entry?
        </p>
        {!unitsMatch && (
          <p className="mt-1 text-xs text-amber-700">
            Units differ ({duplicate.existing.unit} vs {duplicate.data.unit}) — they can&rsquo;t be merged; add separately instead.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {unitsMatch && (
            <button type="button" disabled={submitting} onClick={(): void => { void confirmMerge(); }}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60">
              Merge (&rarr; {duplicate.existing.quantity + duplicate.data.quantity} {duplicate.existing.unit})
            </button>
          )}
          <button type="button" disabled={submitting} onClick={(): void => { void confirmSeparate(); }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            Add separately
          </button>
          <button type="button" disabled={submitting} onClick={(): void => setDuplicate(null)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    )}
    </>
  );
}
