import { daysLeft } from './quick-parse';

/** The subset of `InventoryItem` `soonestExpiring` needs. */
export interface ExpiringLike {
  // `| undefined` alongside the optional `?` so an explicit `expiresAt: undefined`
  // test fixture still satisfies this type under `exactOptionalPropertyTypes`.
  expiresAt?: string | null | undefined;
}

/** The subset of `GroceryListItem` `groceryProgress` needs. */
export interface PurchasableLike {
  isPurchased: boolean;
}

/**
 * Home dashboard derivations (spec 010 US5, research D6). Pure functions only —
 * every figure reads data three app-level contexts already hold; nothing here
 * fetches or re-derives server-computed state (FR-RS-020).
 */

/**
 * The item with the fewest non-negative days left before expiry, reusing
 * `daysLeft` (spec 005 `quick-parse.ts`) so the "soonest" rule matches the
 * rest of the app — the same `dl >= 0` floor `isUrgent()` already applies to
 * the Kitchen's "Use soon" strip. Already-expired items (`dl < 0`) are
 * deliberately excluded: FR-RS-021 pairs this pick with a "find recipes using
 * it" action, which does not make sense for something already spoiled.
 * `null` when the set is empty or no item has a non-negative expiry — the
 * caller shows the calm banner alternative in that case (FR-RS-021 edge case).
 */
export function soonestExpiring<T extends ExpiringLike>(
  items: readonly T[],
  today: Date = new Date(),
): T | null {
  let best: T | null = null;
  let bestDays: number | null = null;
  for (const item of items) {
    const dl = daysLeft(item.expiresAt, today);
    if (dl === null || dl < 0) continue;
    if (bestDays === null || dl < bestDays) {
      best = item;
      bestDays = dl;
    }
  }
  return best;
}

export interface GroceryProgress {
  checked: number;
  total: number;
}

/**
 * The checked/total pair `GroceryListPage.tsx` already computes
 * (`purchased.length` / `items.length`) — extracted so Home and the grocery
 * list share one implementation rather than two (research D6).
 */
export function groceryProgress(items: readonly PurchasableLike[]): GroceryProgress {
  return { checked: items.filter((i) => i.isPurchased).length, total: items.length };
}

/** Empty-state predicates, one per Home figure (FR-RS-021/022). */

export function hasNoExpiringItem<T extends ExpiringLike>(items: readonly T[], today: Date = new Date()): boolean {
  return soonestExpiring(items, today) === null;
}

export function hasNoMealsPlanned(entryCount: number): boolean {
  return entryCount === 0;
}

export function hasNoGroceryItems(total: number): boolean {
  return total === 0;
}

export function hasNoInventoryItems(itemCount: number): boolean {
  return itemCount === 0;
}
