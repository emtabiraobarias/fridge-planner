'use client';
import type { InventoryItem } from '../../services/inventory';
import { daysLeft } from '../../lib/quick-parse';
import { ItemChip } from './ItemChip';

interface Props {
  items: InventoryItem[];
  /**
   * Apply a signed, unit-sized quantity delta to the item. Floors at zero and
   * the row remains — it is never removed by stepping (spec 010 D10, FR-RS-009).
   * Delete stays the one explicit, destructive action (`onDelete`).
   */
  onStep: (item: InventoryItem, delta: number) => void;
  onDelete: (id: string) => void;
  /** Open the scoped editor — expiry + location (FR-UI-019 revised). */
  onEdit: (item: InventoryItem) => void;
  /**
   * Spec 009 US2 (FR-IR-006 Kitchen entry point): when active, each row shows a
   * checkbox for picking ingredients to scope a recipe search. The selection is
   * transient and owned by the parent (`InventoryPage`) — no shared context (D5).
   */
  selectMode?: boolean | undefined;
  selectedIds?: ReadonlySet<string> | undefined;
  onToggleSelect?: ((id: string) => void) | undefined;
}

/** Sort soonest-expiry first; no-expiry items last. */
function sortByExpiry(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((a, b) => {
    const da = daysLeft(a.expiresAt);
    const db = daysLeft(b.expiresAt);
    return (da === null ? Infinity : da) - (db === null ? Infinity : db);
  });
}

export function InventoryList({
  items,
  onStep,
  onDelete,
  onEdit,
  selectMode = false,
  selectedIds,
  onToggleSelect,
}: Props): React.JSX.Element {
  if (items.length === 0) {
    return (
      <p className="text-muted py-6 text-center text-sm">No ingredients yet. Add your first item above.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Inventory items">
      {sortByExpiry(items).map((item) => (
        <ItemChip
          key={item._id}
          item={item}
          onStep={onStep}
          onDelete={onDelete}
          onEdit={onEdit}
          selectMode={selectMode}
          selected={selectedIds?.has(item._id) ?? false}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </ul>
  );
}
