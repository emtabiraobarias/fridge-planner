// @vitest-environment node
// Force a stable, non-UTC timezone so the local-vs-UTC midnight seam (research D3)
// is exercised deterministically regardless of the host clock. Node re-reads
// process.env.TZ on the next Date op (tzset), so setting it here is sufficient.
const ORIGINAL_TZ = process.env['TZ'];
process.env['TZ'] = 'Australia/Sydney'; // UTC+10 in July (no DST); rollover is clear

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { startOfTodayCutoff, reconcileRollingList } from '@server/lib/rolling-grocery';
import type { IGroceryListItem } from '@server/types/grocery-list';

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env['TZ'];
  else process.env['TZ'] = ORIGINAL_TZ;
});

afterEach(() => {
  vi.useRealTimers();
});

// ——— T006: startOfTodayCutoff (FR-RG-010, research D3) ———

describe('startOfTodayCutoff', () => {
  it('projects the server local calendar day onto the UTC-midnight axis', () => {
    // 2026-07-15 09:30 local Sydney (=UTC+10) → local day is the 15th.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T23:30:00.000Z')); // 2026-07-15T09:30 +10
    const cutoff = startOfTodayCutoff();
    expect(cutoff.toISOString()).toBe('2026-07-15T00:00:00.000Z');
  });

  it('keeps a today-dated entry (date == cutoff) in scope all day (FR-RG-010)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T04:00:00.000Z')); // 14:00 local on the 15th
    const cutoff = startOfTodayCutoff();
    const todayEntry = new Date('2026-07-15T00:00:00.000Z'); // authored at UTC midnight
    expect(todayEntry.getTime() >= cutoff.getTime()).toBe(true);
  });

  it('rolls a meal out of scope at local midnight, not UTC midnight (23:59 vs 00:01, research D3)', () => {
    const meal15 = new Date('2026-07-15T00:00:00.000Z'); // "the 15th" meal (UTC-midnight axis)
    const meal16 = new Date('2026-07-16T00:00:00.000Z'); // "the 16th" meal

    // 23:59 local on the 15th = 2026-07-15T13:59Z (UTC day still the 15th).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T13:59:00.000Z'));
    let cutoff = startOfTodayCutoff();
    expect(cutoff.toISOString()).toBe('2026-07-15T00:00:00.000Z');
    expect(meal15.getTime() >= cutoff.getTime()).toBe(true); // today → in scope
    expect(meal16.getTime() >= cutoff.getTime()).toBe(true); // tomorrow → in scope

    // 00:01 local on the 16th = 2026-07-15T14:01Z (UTC day STILL the 15th, local day the 16th).
    vi.setSystemTime(new Date('2026-07-15T14:01:00.000Z'));
    cutoff = startOfTodayCutoff();
    expect(cutoff.toISOString()).toBe('2026-07-16T00:00:00.000Z'); // local-day rollover
    expect(meal15.getTime() >= cutoff.getTime()).toBe(false); // yesterday → shed
    expect(meal16.getTime() >= cutoff.getTime()).toBe(true); // today → still in scope
  });
});

// ——— T008: reconcileRollingList generated-row diff (FR-RG-006/007) ———

function genRow(overrides: Partial<IGroceryListItem> & { ingredientName: string }): IGroceryListItem {
  return {
    ingredientName: overrides.ingredientName,
    displayName: overrides.displayName ?? overrides.ingredientName,
    quantity: overrides.quantity ?? 1,
    unit: overrides.unit ?? 'servings',
    category: overrides.category ?? 'Other',
    isPurchased: overrides.isPurchased ?? false,
    isManuallyAdded: overrides.isManuallyAdded ?? false,
    sourceMealNames: overrides.sourceMealNames ?? [],
    notes: overrides.notes ?? '',
    ...(overrides._id !== undefined ? { _id: overrides._id } : {}),
    ...(overrides.purchaseReceipt ? { purchaseReceipt: overrides.purchaseReceipt } : {}),
    ...(overrides.addedOn ? { addedOn: overrides.addedOn } : {}),
    ...(overrides.purchasedOn ? { purchasedOn: overrides.purchasedOn } : {}),
  };
}

describe('reconcileRollingList — generated rows (US1)', () => {
  const asOf = new Date('2026-07-15T00:00:00.000Z');

  it('keeps a surviving generated row _id and requantifies/re-sources it (FR-RG-007)', () => {
    const existing = [
      genRow({ _id: 'gen1', ingredientName: 'mince', quantity: 100, unit: 'g', sourceMealNames: ['Tacos'] }),
    ];
    const fresh = [
      genRow({ ingredientName: 'mince', quantity: 250, unit: 'g', sourceMealNames: ['Tacos', 'Bolognese'] }),
    ];
    const result = reconcileRollingList(existing, fresh, asOf);
    const mince = result.find((r) => r.ingredientName === 'mince')!;
    expect(mince._id).toBe('gen1');
    expect(mince.quantity).toBe(250);
    expect(mince.unit).toBe('g');
    expect(mince.sourceMealNames).toEqual(['Tacos', 'Bolognese']);
  });

  it('drops a generated row whose need is gone (all sources past) (FR-RG-006)', () => {
    const existing = [genRow({ _id: 'gen1', ingredientName: 'mince', quantity: 100, unit: 'g' })];
    const result = reconcileRollingList(existing, [], asOf);
    expect(result).toHaveLength(0);
  });

  it('shrinks a mixed-source line to only the in-scope shortfall and sources (FR-RG-003)', () => {
    // existing line sourced yesterday+tomorrow; fresh (today-scoped) keeps only tomorrow.
    const existing = [
      genRow({ _id: 'gen1', ingredientName: 'onion', quantity: 2, unit: 'servings', sourceMealNames: ['Yest', 'Tom'] }),
    ];
    const fresh = [genRow({ ingredientName: 'onion', quantity: 1, unit: 'servings', sourceMealNames: ['Tom'] })];
    const result = reconcileRollingList(existing, fresh, asOf);
    const onion = result.find((r) => r.ingredientName === 'onion')!;
    expect(onion._id).toBe('gen1');
    expect(onion.quantity).toBe(1);
    expect(onion.sourceMealNames).toEqual(['Tom']);
  });

  it('inserts a brand-new in-scope need not present in the stored list', () => {
    const fresh = [genRow({ ingredientName: 'garlic', quantity: 2, unit: 'servings', sourceMealNames: ['Soup'] })];
    const result = reconcileRollingList([], fresh, asOf);
    const garlic = result.find((r) => r.ingredientName === 'garlic')!;
    expect(garlic).toBeDefined();
    expect(garlic._id).toBeUndefined();
    expect(garlic.quantity).toBe(2);
  });

  it('passes sticky manual and purchased rows through unchanged in US1 (shed lands in US2)', () => {
    const existing = [
      genRow({ _id: 'man1', ingredientName: 'bread', isManuallyAdded: true, addedOn: asOf }),
      genRow({
        _id: 'buy1',
        ingredientName: 'milk',
        isPurchased: true,
        purchasedOn: asOf,
        purchaseReceipt: { inventoryItemId: 'inv1', quantityAdded: 1, unit: 'L', merged: false },
      }),
    ];
    const result = reconcileRollingList(existing, [], asOf);
    expect(result.find((r) => r._id === 'man1')?.isManuallyAdded).toBe(true);
    const milk = result.find((r) => r._id === 'buy1');
    expect(milk?.isPurchased).toBe(true);
    expect(milk?.purchaseReceipt?.inventoryItemId).toBe('inv1');
  });
});

// ——— T014: reconcileRollingList sticky-row shed + lazy backfill (FR-RG-004/005, research D5) ———

describe('reconcileRollingList — sticky rows: day-anchored shed + legacy backfill (US2)', () => {
  const asOf = new Date('2026-07-15T00:00:00.000Z');
  const today = asOf;
  const yesterday = new Date('2026-07-14T00:00:00.000Z');

  it('preserves a manual row anchored today verbatim (FR-RG-004)', () => {
    const existing = [genRow({ _id: 'man1', ingredientName: 'bread', isManuallyAdded: true, addedOn: today })];
    const result = reconcileRollingList(existing, [], asOf);
    const bread = result.find((r) => r._id === 'man1');
    expect(bread).toBeDefined();
    expect(bread?.isManuallyAdded).toBe(true);
    expect(bread?.addedOn).toEqual(today);
  });

  it('sheds a manual row anchored before today (FR-RG-004)', () => {
    const existing = [genRow({ _id: 'man1', ingredientName: 'bread', isManuallyAdded: true, addedOn: yesterday })];
    const result = reconcileRollingList(existing, [], asOf);
    expect(result.find((r) => r._id === 'man1')).toBeUndefined();
  });

  it('preserves a purchased row anchored today with its receipt intact, even when its source meal has passed (FR-RG-005)', () => {
    const existing = [
      genRow({
        _id: 'buy1',
        ingredientName: 'milk',
        isPurchased: true,
        purchasedOn: today,
        sourceMealNames: ['Yesterday Dinner'], // source meal date is irrelevant to sticky preservation
        purchaseReceipt: { inventoryItemId: 'inv1', quantityAdded: 1, unit: 'L', merged: false },
      }),
    ];
    const result = reconcileRollingList(existing, [], asOf);
    const milk = result.find((r) => r._id === 'buy1');
    expect(milk).toBeDefined();
    expect(milk?.isPurchased).toBe(true);
    expect(milk?.purchaseReceipt?.inventoryItemId).toBe('inv1');
  });

  it('sheds a purchased row anchored before today, dropping the row and its receipt with no inventory mutation implied (FR-RG-005)', () => {
    const existing = [
      genRow({
        _id: 'buy1',
        ingredientName: 'milk',
        isPurchased: true,
        purchasedOn: yesterday,
        purchaseReceipt: { inventoryItemId: 'inv1', quantityAdded: 1, unit: 'L', merged: false },
      }),
    ];
    const result = reconcileRollingList(existing, [], asOf);
    expect(result.find((r) => r._id === 'buy1')).toBeUndefined();
  });

  it('lazily backfills a legacy manual row with no anchor to addedOn=asOf and preserves it this call (research D5)', () => {
    const existing = [genRow({ _id: 'legacyManual', ingredientName: 'bread', isManuallyAdded: true })];
    const result = reconcileRollingList(existing, [], asOf);
    const bread = result.find((r) => r._id === 'legacyManual');
    expect(bread).toBeDefined();
    expect(bread?.addedOn).toEqual(asOf);
    expect(bread?.purchasedOn).toBeUndefined();
  });

  it('lazily backfills a legacy purchased/receipted row with no anchor to purchasedOn=asOf and preserves it this call (research D5)', () => {
    const existing = [
      genRow({
        _id: 'legacyBuy',
        ingredientName: 'milk',
        isPurchased: true,
        purchaseReceipt: { inventoryItemId: 'inv1', quantityAdded: 1, unit: 'L', merged: false },
      }),
    ];
    const result = reconcileRollingList(existing, [], asOf);
    const milk = result.find((r) => r._id === 'legacyBuy');
    expect(milk).toBeDefined();
    expect(milk?.purchasedOn).toEqual(asOf);
    expect(milk?.addedOn).toBeUndefined();
  });
});
