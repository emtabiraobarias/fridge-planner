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
 * A fresh need whose name is already represented by a *preserved same-day purchased*
 * row is suppressed (FR-RG-005 + FR-RG-011: "nothing is asked to be bought twice").
 * The servings-model generator re-emits such a need every recompute because a
 * `servings` line can't net against the real-unit stock the check-off just added
 * (unit-incompatible), so without this the purchased row and a fresh duplicate would
 * both show. It keys on the purchased row, not on netting — matching FR-RG-011's
 * same-day preservation semantics; the row (and its coverage) sheds at rollover.
 *
 * @param existing plain (`.toObject()`-ed) stored items — never hydrated subdocs
 * @param freshGenerated fresh generated needs (no `_id`) from `generateGroceryList`
 * @param asOf the rolling cutoff (`startOfTodayCutoff()`)
 */
/** The disposition of one stored row after reconciliation against the fresh needs. */
interface ReconciledRow {
  keep?: IGroceryListItem; // the row to retain, or undefined if shed/dropped
  matchedName?: string; // a replaceable generated name that consumed its fresh need
  purchasedName?: string; // a preserved purchased name that suppresses a fresh duplicate
}

/** Reconcile a single stored row: sticky rows are day-anchor reconciled; replaceable
 *  generated rows are requantified from their fresh need or dropped (FR-RG-006/007). */
function reconcileExistingRow(
  item: IGroceryListItem,
  freshByName: Map<string, IGroceryListItem>,
  asOf: Date,
): ReconciledRow {
  if (!isReplaceableGenerated(item)) {
    const sticky = reconcileSticky(item, asOf);
    if (!sticky) return {};
    const purchasedLike = sticky.isPurchased || !!sticky.purchaseReceipt;
    return { keep: sticky, ...(purchasedLike ? { purchasedName: sticky.ingredientName } : {}) };
  }
  const fresh = freshByName.get(item.ingredientName);
  if (!fresh || fresh.quantity <= 0) return {}; // FR-RG-006: need gone → drop row
  return {
    keep: {
      ...item,
      quantity: fresh.quantity,
      unit: fresh.unit,
      sourceMealNames: fresh.sourceMealNames,
    },
    matchedName: item.ingredientName,
  };
}

export function reconcileRollingList(
  existing: IGroceryListItem[],
  freshGenerated: IGroceryListItem[],
  asOf: Date,
): IGroceryListItem[] {
  const freshByName = new Map(freshGenerated.map((f) => [f.ingredientName, f]));
  const matchedNames = new Set<string>(); // fresh needs already consumed by a stored generated row
  const purchasedNames = new Set<string>(); // covered by a preserved same-day purchased row (FR-RG-011)
  const result: IGroceryListItem[] = [];

  for (const item of existing) {
    const { keep, matchedName, purchasedName } = reconcileExistingRow(item, freshByName, asOf);
    if (keep) result.push(keep);
    if (matchedName) matchedNames.add(matchedName);
    if (purchasedName) purchasedNames.add(purchasedName);
  }

  for (const fresh of freshGenerated) {
    // Skip a name already represented by a stored generated row (handled above) or by a
    // same-day purchased row — the latter is stock already bought today (FR-RG-011).
    const covered =
      matchedNames.has(fresh.ingredientName) || purchasedNames.has(fresh.ingredientName);
    if (!covered && fresh.quantity > 0) result.push(fresh); // brand-new in-scope need
  }

  return result;
}
