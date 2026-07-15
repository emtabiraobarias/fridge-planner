'use client';
import { useEffect, useState } from 'react';
import type { InventoryItem, InventoryItemUpdate, Location } from '../../services/inventory';

const LOCATIONS: readonly Location[] = ['fridge', 'freezer', 'pantry'];
const LOCATION_LABEL: Record<Location, string> = {
  fridge: 'Fridge',
  freezer: 'Freezer',
  pantry: 'Pantry',
};

interface EditItemSheetProps {
  item: InventoryItem | null;
  onClose: () => void;
  /** Persist the change (context editItem). expiresAt null clears the expiry. */
  onSave: (id: string, data: InventoryItemUpdate) => Promise<void>;
}

/**
 * Scoped item editor (spec 004 FR-UI-019 revised): expiry date — settable and
 * clearable — and location. Quantity stays on the row stepper; other fields are
 * not editable in place.
 */
export function EditItemSheet({ item, onClose, onSave }: EditItemSheetProps): React.JSX.Element | null {
  const [date, setDate] = useState('');
  const [location, setLocation] = useState<Location>('fridge');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) return;
    setDate(item.expiresAt ? item.expiresAt.slice(0, 10) : '');
    setLocation(item.location);
    setSaving(false);

    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return (): void => document.removeEventListener('keydown', handleKey);
  }, [item, onClose]);

  if (!item) return null;

  async function handleSave(): Promise<void> {
    if (!item) return;
    setSaving(true);
    // Anchor at UTC midnight so the picked calendar date survives timezone
    // conversion (same convention as QuickAdd). Empty date = clear the expiry.
    const expiresAt = date ? `${date}T00:00:00.000Z` : null;
    await onSave(item._id, { expiresAt, location });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-item-title"
        className="relative z-10 w-full max-w-sm rounded-xl bg-surface p-6 shadow-xl"
      >
        <h2 id="edit-item-title" className="font-heading text-h4 text-ink pr-6">
          Edit {item.name}
        </h2>
        <p className="text-muted mt-0.5 text-xs">
          {item.quantity} {item.unit} · {item.category}
        </p>

        <label htmlFor="edit-expiry" className="mt-4 block text-sm font-semibold text-ink">
          Expiry date
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="edit-expiry"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 rounded-lg border border-divider bg-bg px-3 py-2 text-sm text-ink"
          />
          {date && (
            <button
              type="button"
              onClick={() => setDate('')}
              className="rounded-full border border-divider px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/[0.07]"
            >
              No expiry
            </button>
          )}
        </div>

        <p className="mt-4 text-sm font-semibold text-ink">Location</p>
        <div role="radiogroup" aria-label="Location" className="mt-1 flex gap-1.5">
          {LOCATIONS.map((loc) => (
            <button
              key={loc}
              type="button"
              role="radio"
              aria-checked={location === loc}
              onClick={() => setLocation(loc)}
              className={`flex-1 rounded-full border px-3 py-2 text-[13px] font-semibold transition-colors ${
                location === loc
                  ? 'border-accent bg-accent-100 text-accent-800'
                  : 'border-divider text-ink hover:bg-ink/[0.07]'
              }`}
            >
              {LOCATION_LABEL[loc]}
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-divider px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.07]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-bg hover:bg-accent-600 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
