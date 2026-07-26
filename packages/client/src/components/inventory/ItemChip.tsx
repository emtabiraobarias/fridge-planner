'use client';
import { Pencil, Trash2 } from 'lucide-react';
import type { InventoryItem } from '../../services/inventory';
import { daysLeft, expiryText, expiryStatus, type ExpiryStatus } from '../../lib/quick-parse';
import { QuantityStepper } from './QuantityStepper';

interface Props {
  item: InventoryItem;
  onStep: (item: InventoryItem, delta: number) => void;
  onDelete: (id: string) => void;
  onEdit: (item: InventoryItem) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: ((id: string) => void) | undefined;
}

const DOT_CLASS: Record<ExpiryStatus, string> = {
  expired: 'bg-accent-600',
  soon: 'bg-accent-400',
  fresh: 'bg-accent2-500',
};
const EXPIRY_TEXT_CLASS: Record<ExpiryStatus, string> = {
  expired: 'text-accent-700',
  soon: 'text-accent-600',
  fresh: 'text-accent2-700',
};
/** Design §4.2.3: the "quantity is 0" dot overrides the expiry colour — a distinct,
 * neutral state rather than borrowing an expiry tint (spec 010 D10, FR-RS-009). */
const ZERO_DOT_CLASS = 'bg-neutral-400';

/**
 * One item row (spec 010 T022 extraction of the shipped `InventoryList` markup):
 * status dot + text expiry line, name, quantity stepper, edit/delete, and the
 * spec 009 select-mode checkbox — unchanged behaviour, moved out of the `<ul>` map.
 */
export function ItemChip({
  item,
  onStep,
  onDelete,
  onEdit,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: Props): React.JSX.Element {
  const dl = daysLeft(item.expiresAt);
  const status = expiryStatus(dl);
  const expired = status === 'expired';
  // Flooring at zero (D10) keeps the row — its dot switches to the neutral
  // "quantity is 0" state regardless of expiry, per design §4.2.3 / FR-RS-009.
  // The zero-ness is never colour-only: it is corroborated by the visible
  // quantity text on the stepper itself (e.g. "0 kg").
  const isZero = item.quantity <= 0;
  const dotClass = isZero ? ZERO_DOT_CLASS : DOT_CLASS[status];

  return (
    <li
      aria-label={item.name}
      className={`flex flex-col gap-2 rounded-[14px] px-3 py-2.5 ${expired ? 'bg-accent-100' : 'bg-surface'}`}
    >
      {/* Identity row. The chip stacks rather than sitting on one line because a
          shelf column is only ~180px wide at the 3-column desktop count (design
          §1.2) — a single horizontal row collapses the name to nothing and pushes
          the stepper outside the card. Every child that must never shrink is
          `shrink-0`; the name is the only flexible element and truncates. */}
      <div className="flex min-w-0 items-center gap-2">
        {selectMode && (
          // Native `<label>` wrapping only the input gives a real 44px tap
          // target for free (clicking anywhere in it toggles the checkbox)
          // without shrinking the compact 20px visual (FR-RS-025, SC-RS-003).
          <label className="grid h-11 w-11 shrink-0 place-items-center">
            <input
              type="checkbox"
              aria-label={`Select ${item.name}`}
              checked={selected}
              onChange={() => onToggleSelect?.(item._id)}
              className="h-5 w-5 accent-accent"
            />
          </label>
        )}
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
          {item.name}
        </span>
      </div>

      {/* Metadata. Expiry is a text line, so status is never colour-only (FR-RS-009). */}
      <div className="min-w-0">
        <div className="truncate text-xs text-muted">
          {item.category} · {item.location}
        </div>
        <div className={`truncate text-[12.5px] font-semibold ${EXPIRY_TEXT_CLASS[status]}`}>
          {expiryText(dl)}
        </div>
      </div>

      {/* Controls. `flex-wrap` lets the actions drop below the stepper on the
          narrowest shelves instead of overflowing the card. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <QuantityStepper
          quantity={item.quantity}
          unit={item.unit}
          name={item.name}
          onStep={(delta) => onStep(item, delta)}
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label={`Edit ${item.name}`}
            onClick={() => onEdit(item)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-divider text-ink hover:bg-ink/[0.07]"
          >
            <Pencil size={15} strokeWidth={2.75} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Delete ${item.name}`}
            onClick={() => onDelete(item._id)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-divider text-ink hover:bg-ink/[0.07]"
          >
            <Trash2 size={15} strokeWidth={2.75} aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}
