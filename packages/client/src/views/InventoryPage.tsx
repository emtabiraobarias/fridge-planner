'use client';
import { useRef, useState } from 'react';
import { useInventory } from '../context/InventoryContext';
import { useToast } from '../context/ToastContext';
import { QuickAdd } from '../components/inventory/QuickAdd';
import { UseSoonStrip, type UrgentItem } from '../components/inventory/UseSoonStrip';
import { LocationFilter, type LocationFilterValue } from '../components/inventory/LocationFilter';
import { InventoryList } from '../components/inventory/InventoryList';
import { RecommendationsPanel } from '../components/recommendations/RecommendationsPanel';
import { daysLeft, isUrgent, applyStep, type ParsedQuick } from '../lib/quick-parse';
import type { InventoryItem } from '../services/inventory';

export function InventoryPage(): React.JSX.Element {
  const { items, loading, error, addItem, editItem, removeItem } = useInventory();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<LocationFilterValue>('All');
  const recsRef = useRef<HTMLDivElement>(null);

  async function handleAdd(p: ParsedQuick): Promise<void> {
    const data: Omit<InventoryItem, '_id' | 'expirationStatus'> = {
      name: p.name,
      quantity: p.quantity,
      unit: p.unit,
      category: p.category,
      location: p.location,
      ...(p.expiresAt ? { expiresAt: new Date(`${p.expiresAt}T00:00:00`).toISOString() } : {}),
    };
    await addItem(data);
    showToast(`${p.name} added to your ${p.location}`);
  }

  async function handleStep(item: InventoryItem, delta: number): Promise<void> {
    const next = applyStep(item.quantity, delta);
    if (next === 0) {
      await removeItem(item._id);
      showToast(`${item.name} removed`);
    } else {
      await editItem(item._id, { quantity: next });
    }
  }

  async function handleDelete(id: string): Promise<void> {
    const item = items.find((i) => i._id === id);
    await removeItem(id);
    if (item) showToast(`${item.name} removed`);
  }

  const visible = filter === 'All' ? items : items.filter((i) => i.location === filter.toLowerCase());

  const urgent: UrgentItem[] = items
    .map((i) => ({ id: i._id, name: i.name, daysLeft: daysLeft(i.expiresAt) }))
    .filter((u) => isUrgent(u.daysLeft));

  return (
    <div className="grid grid-cols-1 gap-7 min-[900px]:grid-cols-[1fr_400px]">
      <div className="flex flex-col gap-5">
        <UseSoonStrip
          items={urgent}
          onCookThese={() => recsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />

        <QuickAdd onAdd={handleAdd} />

        <LocationFilter
          value={filter}
          onChange={setFilter}
          visibleCount={visible.length}
          totalCount={items.length}
        />

        {loading && <p className="text-muted animate-pulse text-sm">Loading inventory…</p>}
        {error && (
          <p role="alert" className="rounded-lg bg-accent-100 p-3 text-sm text-accent-800">
            {error}
          </p>
        )}
        {!loading && <InventoryList items={visible} onStep={handleStep} onDelete={handleDelete} />}
      </div>

      <div ref={recsRef}>
        <RecommendationsPanel />
      </div>
    </div>
  );
}
