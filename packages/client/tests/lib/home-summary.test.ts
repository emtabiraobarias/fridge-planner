import { describe, it, expect } from 'vitest';
import {
  soonestExpiring,
  groceryProgress,
  hasNoExpiringItem,
  hasNoMealsPlanned,
  hasNoGroceryItems,
  hasNoInventoryItems,
} from '../../src/lib/home-summary';

// Pinned "today" so day-count comparisons are deterministic (mirrors the TODAY
// convention in tests/lib/quick-parse.test.ts).
const TODAY = new Date(2026, 6, 20);

describe('soonestExpiring (FR-RS-020)', () => {
  it('returns the item with the fewest days left', () => {
    const items = [
      { _id: 'a', expiresAt: '2026-07-25' },
      { _id: 'b', expiresAt: '2026-07-21' },
      { _id: 'c', expiresAt: '2026-07-23' },
    ];
    expect(soonestExpiring(items, TODAY)?.['_id']).toBe('b');
  });

  it('ignores items with no expiry date when picking the soonest', () => {
    const items = [{ _id: 'a', expiresAt: undefined }, { _id: 'b', expiresAt: '2026-07-22' }];
    expect(soonestExpiring(items, TODAY)?.['_id']).toBe('b');
  });

  it('returns null for an empty set (FR-RS-021 edge case)', () => {
    expect(soonestExpiring([], TODAY)).toBeNull();
  });

  it('returns null when no item in the set has an expiry date', () => {
    expect(soonestExpiring([{ expiresAt: undefined }, { expiresAt: null }], TODAY)).toBeNull();
  });

  it('excludes already-expired items — a spoiled item is not something to "cook" (FR-RS-021)', () => {
    const items = [
      { _id: 'expired', expiresAt: '2026-07-10' }, // 10 days before TODAY
      { _id: 'fresh', expiresAt: '2026-07-24' },
    ];
    expect(soonestExpiring(items, TODAY)?.['_id']).toBe('fresh');
  });

  it('returns null when every item with an expiry date is already expired', () => {
    expect(soonestExpiring([{ expiresAt: '2026-07-01' }], TODAY)).toBeNull();
  });
});

describe('groceryProgress', () => {
  it('returns the checked/total pair GroceryListPage already computes', () => {
    const items = [{ isPurchased: true }, { isPurchased: false }, { isPurchased: true }];
    expect(groceryProgress(items)).toEqual({ checked: 2, total: 3 });
  });

  it('returns zero/zero for an empty list', () => {
    expect(groceryProgress([])).toEqual({ checked: 0, total: 0 });
  });
});

describe('empty-state predicates (FR-RS-020/021)', () => {
  it('hasNoExpiringItem is true for an empty set and for a set with no expiry dates', () => {
    expect(hasNoExpiringItem([], TODAY)).toBe(true);
    expect(hasNoExpiringItem([{ expiresAt: undefined }], TODAY)).toBe(true);
  });

  it('hasNoExpiringItem is false once at least one item has an expiry date', () => {
    expect(hasNoExpiringItem([{ expiresAt: '2026-07-22' }], TODAY)).toBe(false);
  });

  it('hasNoMealsPlanned/hasNoGroceryItems/hasNoInventoryItems reflect a zero count', () => {
    expect(hasNoMealsPlanned(0)).toBe(true);
    expect(hasNoMealsPlanned(1)).toBe(false);
    expect(hasNoGroceryItems(0)).toBe(true);
    expect(hasNoGroceryItems(6)).toBe(false);
    expect(hasNoInventoryItems(0)).toBe(true);
    expect(hasNoInventoryItems(7)).toBe(false);
  });
});
