'use client';
import { useEffect, useRef, useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useToast } from '../context/ToastContext';
import { QuickAdd } from '../components/inventory/QuickAdd';
import { UseSoonStrip, type UrgentItem } from '../components/inventory/UseSoonStrip';
import { Shelf } from '../components/inventory/Shelf';
import { EditItemSheet } from '../components/inventory/EditItemSheet';
import { RecommendationsPanel } from '../components/recommendations/RecommendationsPanel';
import { LOCATIONS, groupByLocation } from '../lib/locations';
import { daysLeft, isUrgent, applyStep, type ParsedQuick } from '../lib/quick-parse';
import type { InventoryItem, InventoryItemUpdate } from '../services/inventory';

export function InventoryPage(): React.JSX.Element {
  const { items, loading, error, addItem, editItem, removeItem } = useInventory();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  // Spec 009 US2 (FR-IR-006/007): transient Kitchen ingredient selection — owned
  // here, not a shared context (research D5). It scopes the one RecommendationsPanel
  // action when non-empty.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const recsRef = useRef<HTMLDivElement>(null);
  // Spec 009 US3 (research D7): the Undo toast's onAction closure is captured once,
  // at merge time — a ref keeps it reading the LATEST quantity (not the stale one
  // from when the toast was shown) so an intervening edit is never clobbered.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  function toggleSelectMode(): void {
    setSelectMode((on) => !on);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleEditSave(id: string, data: InventoryItemUpdate): Promise<void> {
    await editItem(id, data);
    showToast(`${editing?.name ?? 'Item'} updated`);
  }

  async function handleAdd(p: ParsedQuick): Promise<void> {
    const data: Omit<InventoryItem, '_id' | 'expirationStatus'> & { mergeDuplicates: boolean } = {
      name: p.name,
      quantity: p.quantity,
      unit: p.unit,
      category: p.category,
      location: p.location,
      // Anchor at UTC midnight so the stored ISO datetime keeps the parsed calendar
      // date (a local-midnight conversion can shift the day across the UTC boundary).
      ...(p.expiresAt ? { expiresAt: `${p.expiresAt}T00:00:00.000Z` } : {}),
      // Spec 009 US3 (FR-IR-012): quick-add is the ONLY opt-in caller — deliberate
      // creates elsewhere (e.g. a future explicit add form) keep the flag absent.
      mergeDuplicates: true,
    };
    const result = await addItem(data);
    if (result.merged) {
      const { mergedItemId, addedQuantity } = result;
      showToast(`${p.name} merged into your existing item`, {
        label: 'Undo',
        onAction: () => {
          const current = itemsRef.current.find((i) => i._id === mergedItemId);
          if (!current) return;
          // Subtract-delta-and-clamp (research D7): reverses exactly the merge's
          // contribution against whatever the CURRENT quantity is, so an edit made
          // between merge and Undo is preserved rather than clobbered — and the
          // result can never go negative/phantom.
          const next = Math.max(0, Math.round((current.quantity - addedQuantity) * 100) / 100);
          void editItem(mergedItemId, { quantity: next });
        },
      });
    } else {
      showToast(`${p.name} added to your ${p.location}`);
    }
  }

  // Spec 010 D10/FR-RS-009: the stepper floors at zero and PERSISTS the row — it
  // never deletes. The `${name} removed` toast stays on the explicit delete
  // action (`handleDelete`) below; this is the one deliberate behaviour change
  // from the shipped app (see research.md D10).
  async function handleStep(item: InventoryItem, delta: number): Promise<void> {
    const next = applyStep(item.quantity, delta);
    await editItem(item._id, { quantity: next });
  }

  async function handleDelete(id: string): Promise<void> {
    const item = items.find((i) => i._id === id);
    await removeItem(id);
    if (item) showToast(`${item.name} removed`);
  }

  const urgent: UrgentItem[] = items
    .map((i) => ({ id: i._id, name: i.name, daysLeft: daysLeft(i.expiresAt) }))
    .filter((u) => isUrgent(u.daysLeft));

  // Spec 010 D7/FR-RS-008: group by the shipped `LOCATIONS` enum — all three
  // known shelves always render (even at zero items); an out-of-enum location
  // is never dropped, it renders under one fallback shelf instead.
  const { byLocation, fallback: fallbackItems } = groupByLocation(items);

  return (
    <div className="grid grid-cols-1 gap-7 min900:grid-cols-[1fr_400px]">
      <div className="flex flex-col gap-5">
        <UseSoonStrip
          items={urgent}
          onCookThese={() =>
            recsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />

        <QuickAdd onAdd={handleAdd} />

        {items.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={toggleSelectMode}
              aria-pressed={selectMode}
              aria-label={
                selectMode ? 'Cancel ingredient selection' : 'Select items for recipe search'
              }
              className="shrink-0 rounded-full border border-divider px-3 py-1.5 text-[13px] font-semibold hover:bg-ink/[0.07]"
            >
              {selectMode ? 'Cancel' : 'Select items'}
            </button>
          </div>
        )}

        {loading && <p className="text-muted animate-pulse text-sm">Loading inventory…</p>}
        {error && (
          <p role="alert" className="rounded-lg bg-accent-100 p-3 text-sm text-accent-800">
            {error}
          </p>
        )}
        {/* Shelves STACK, one per row — they are never columns.
            User-reported (2026-07-27): side-by-side shelves made picking ingredients for
            recipe search awkward, because the select checkboxes were scattered across two
            or three columns instead of forming one line the eye and thumb can run down.
            Stacking also gives every chip the full column width, which is what lets a chip
            be a single compact row (see ItemChip) rather than a two-row card — so the
            extra vertical space stacking costs is largely paid back by shorter chips.
            This supersedes the design's fixed 1/2/3 shelf counts (§1.2, FR-RS-005), which
            assumed shelves owned the whole content width; they do not — this page is itself
            two columns (`1fr 400px`). At three across, each chip had 139px of usable
            width, narrower than its own quantity stepper. */}
        {!loading && (
          <div className="flex flex-col gap-3.5">
            {LOCATIONS.map((loc) => (
              <Shelf
                key={loc}
                location={loc}
                items={byLocation.get(loc) ?? []}
                onStep={handleStep}
                onDelete={handleDelete}
                onEdit={setEditing}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            ))}
            {fallbackItems.length > 0 && (
              <Shelf
                location="other"
                items={fallbackItems}
                onStep={handleStep}
                onDelete={handleDelete}
                onEdit={setEditing}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            )}
          </div>
        )}
      </div>

      <div ref={recsRef}>
        <RecommendationsPanel
          {...(selectMode && selectedIds.size > 0 ? { ingredientItemIds: [...selectedIds] } : {})}
        />
      </div>

      {/* Scoped editor: expiry + location (spec 004 FR-UI-019 revised) */}
      <EditItemSheet item={editing} onClose={() => setEditing(null)} onSave={handleEditSave} />
    </div>
  );
}
