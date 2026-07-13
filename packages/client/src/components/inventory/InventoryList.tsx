'use client';
import { Trash2 } from 'lucide-react';
import type { InventoryItem } from '../../services/inventory';
import { daysLeft, expiryText, expiryStatus } from '../../lib/quick-parse';
import { QuantityStepper } from './QuantityStepper';

interface Props {
  items: InventoryItem[];
  /** Apply a signed, unit-sized quantity delta to the item (zero removes it). */
  onStep: (item: InventoryItem, delta: number) => void;
  onDelete: (id: string) => void;
}

const DOT_CLASS = { expired: 'bg-accent-600', soon: 'bg-accent-400', fresh: 'bg-accent2-500' } as const;
const EXPIRY_TEXT_CLASS = {
  expired: 'text-accent-700',
  soon: 'text-accent-600',
  fresh: 'text-accent2-700',
} as const;

/** Sort soonest-expiry first; no-expiry items last. */
function sortByExpiry(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => {
    const da = daysLeft(a.expiresAt);
    const db = daysLeft(b.expiresAt);
    return (da === null ? Infinity : da) - (db === null ? Infinity : db);
  });
}

export function InventoryList({ items, onStep, onDelete }: Props): React.JSX.Element {
  if (items.length === 0) {
    return (
      <p className="text-muted py-6 text-center text-sm">No ingredients yet. Add your first item above.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Inventory items">
      {sortByExpiry(items).map((item) => {
        const dl = daysLeft(item.expiresAt);
        const status = expiryStatus(dl);
        const expired = status === 'expired';
        return (
          <li
            key={item._id}
            aria-label={item.name}
            className={`flex items-center gap-3.5 rounded-lg px-4 py-3 ${expired ? 'bg-accent-100' : 'bg-surface'}`}
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_CLASS[status]}`} aria-hidden />

            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold text-ink">{item.name}</div>
              <div className="text-muted text-xs">
                {item.category} · {item.location}
              </div>
              <div className={`text-[12.5px] font-semibold ${EXPIRY_TEXT_CLASS[status]}`}>
                {expiryText(dl)}
              </div>
            </div>

            <QuantityStepper
              quantity={item.quantity}
              unit={item.unit}
              name={item.name}
              onStep={(delta) => onStep(item, delta)}
            />

            <button
              type="button"
              aria-label={`Delete ${item.name}`}
              onClick={() => onDelete(item._id)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-divider text-ink hover:bg-ink/[0.07]"
            >
              <Trash2 size={15} strokeWidth={2.75} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
