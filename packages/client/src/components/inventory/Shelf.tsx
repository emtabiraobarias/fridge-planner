'use client';
import type { InventoryItem } from '../../services/inventory';
import { LOCATION_LABEL, isKnownLocation } from '../../lib/locations';
import { InventoryList } from './InventoryList';

interface Props {
  /** The storage-location value the shelf represents — one of `LOCATIONS`, or an
   * out-of-enum string, which renders under a neutral fallback tint (D7, FR-RS-008). */
  location: string;
  items: InventoryItem[];
  onStep: (item: InventoryItem, delta: number) => void;
  onDelete: (id: string) => void;
  onEdit: (item: InventoryItem) => void;
  selectMode?: boolean | undefined;
  selectedIds?: ReadonlySet<string> | undefined;
  onToggleSelect?: ((id: string) => void) | undefined;
}

// Design §4.2.3 shelf tints — one per known location, plus a neutral fallback
// for a location value outside the shipped `LOCATIONS` enum (never dropped, D7).
const TINT_CLASS: Record<string, string> = {
  fridge: 'bg-accent2-100',
  freezer: 'bg-accent-100',
  pantry: 'bg-neutral-100',
};
const FALLBACK_TINT = 'bg-neutral-100';

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function labelFor(location: string): string {
  return isKnownLocation(location) ? LOCATION_LABEL[location] : capitalize(location);
}

/**
 * One storage-location shelf card (spec 010 US2, design §4.2.3): a tinted card
 * with a header (`location` name + `N items` count) wrapping the shipped
 * `InventoryList` — so its expiry/edit/delete/select-mode affordances (and their
 * tests) are reused wholesale rather than reimplemented (research D7, FR-RS-010).
 * Always renders, even at zero items, per the design's "never disappears" rule.
 */
export function Shelf({
  location,
  items,
  onStep,
  onDelete,
  onEdit,
  selectMode,
  selectedIds,
  onToggleSelect,
}: Props): React.JSX.Element {
  const tint = TINT_CLASS[location] ?? FALLBACK_TINT;
  const label = labelFor(location);
  const count = items.length;

  return (
    <section aria-label={`${label} shelf`} className={`rounded-[22px] p-4 shadow-sm ${tint}`}>
      <div className="mb-3 flex items-center justify-between border-b border-divider pb-[11px]">
        <h3 className="font-heading text-h5 text-ink">{label}</h3>
        <span className="text-muted text-xs">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
      </div>
      <InventoryList
        items={items}
        onStep={onStep}
        onDelete={onDelete}
        onEdit={onEdit}
        selectMode={selectMode}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
      />
    </section>
  );
}
