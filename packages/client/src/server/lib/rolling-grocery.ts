import 'server-only';
import type { IGroceryListItem } from '../types/grocery-list';

/**
 * The rolling scope cutoff: the server's **local** calendar day projected onto the
 * meal-plan entries' **UTC-midnight** axis (research D3). An entry is in scope iff
 * `entry.date.getTime() >= startOfTodayCutoff().getTime()`. A today-dated entry
 * (`date == cutoff`) stays in scope for the whole local day (FR-RG-010).
 */
export function startOfTodayCutoff(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** A stored row is a replaceable *generated* row iff it carries no stickiness —
 *  not manual, not purchased, and no purchase receipt (data-model row taxonomy). */
function isReplaceableGenerated(item: IGroceryListItem): boolean {
  return !item.isManuallyAdded && !item.isPurchased && !item.purchaseReceipt;
}

/**
 * Reconciles a sticky (manual / purchased / receipted) row against the rolling
 * cutoff (research D4/D5): a row's anchor day is `purchasedOn ?? addedOn`.
 *  - anchor >= asOf → preserved verbatim (receipt intact, FR-RG-004/005).
 *  - anchor < asOf → shed: the row (and its receipt) is dropped, no inventory
 *    mutation implied (FR-RG-005/011).
 *  - no anchor at all (legacy pre-008 row) → lazily backfilled to `asOf` and
 *    preserved for this call (data-model "Back-compat for legacy rows"): purchased/
 *    receipted rows are stamped `purchasedOn`, everything else `addedOn`.
 *
 * @returns the (possibly backfilled) row to keep, or `undefined` if shed.
 */
function reconcileSticky(item: IGroceryListItem, asOf: Date): IGroceryListItem | undefined {
  const anchor = item.purchasedOn ?? item.addedOn;
  if (anchor === undefined) {
    const isPurchasedLike = item.isPurchased || !!item.purchaseReceipt;
    return isPurchasedLike ? { ...item, purchasedOn: asOf } : { ...item, addedOn: asOf };
  }
  if (anchor.getTime() < asOf.getTime()) return undefined; // shed
  return item;
}

/**
 * Reconciles a freshly generated (date-scoped) need set into the stored grocery
 * items, preserving row identity (research D4).
 *
 * Replaceable generated rows are diffed against `freshGenerated` by
 * `ingredientName`: a surviving name keeps its `_id` and is requantified/re-sourced
 * (FR-RG-007); a name whose fresh need is gone or zero is dropped (FR-RG-006); a
 * fresh need with no stored row is inserted. Sticky rows (manual / purchased /
 * receipted) are day-anchor reconciled per `reconcileSticky` (FR-RG-004/005).
 *
 * @param existing plain (`.toObject()`-ed) stored items — never hydrated subdocs
 * @param freshGenerated fresh generated needs (no `_id`) from `generateGroceryList`
 * @param asOf the rolling cutoff (`startOfTodayCutoff()`)
 */
export function reconcileRollingList(
  existing: IGroceryListItem[],
  freshGenerated: IGroceryListItem[],
  asOf: Date,
): IGroceryListItem[] {
  const freshByName = new Map(freshGenerated.map((f) => [f.ingredientName, f]));
  const matchedNames = new Set<string>();
  const result: IGroceryListItem[] = [];

  for (const item of existing) {
    if (!isReplaceableGenerated(item)) {
      const sticky = reconcileSticky(item, asOf);
      if (sticky) result.push(sticky);
      continue;
    }
    const fresh = freshByName.get(item.ingredientName);
    if (!fresh || fresh.quantity <= 0) continue; // FR-RG-006: need gone → drop row
    matchedNames.add(item.ingredientName);
    result.push({
      ...item,
      quantity: fresh.quantity,
      unit: fresh.unit,
      sourceMealNames: fresh.sourceMealNames,
    });
  }

  for (const fresh of freshGenerated) {
    if (!matchedNames.has(fresh.ingredientName) && fresh.quantity > 0) {
      result.push(fresh); // brand-new in-scope need
    }
  }

  return result;
}
