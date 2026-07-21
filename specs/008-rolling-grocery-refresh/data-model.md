# Data Model — Daily Rolling Grocery-List Refresh (`impl/nextjs`)

Phase 1 output. Storage is MongoDB via Mongoose; **no new collection and no new index**. This feature adds two day-anchor stamps to `grocery_lists.items` and reads `meal_plans` / `inventory_items` unchanged. `MealPlan` and `InventoryItem` schemas are untouched.

## GroceryList item subdocument (extended)

```typescript
interface IGroceryListItem {
  _id?: string;
  ingredientName: string;       // normalized canonical key (reconcile key, Research D4)
  displayName: string;
  quantity: number;
  unit: string;
  category: GroceryCategory;
  isPurchased: boolean;
  isManuallyAdded: boolean;
  sourceMealNames: string[];
  notes: string;
  purchaseReceipt?: PurchaseReceipt;  // spec 007 — unchanged
  addedOn?: Date;                     // NEW — set when a manual item is created
  purchasedOn?: Date;                 // NEW — set when a line is ticked purchased
}
```

- `addedOn` is set in `addGroceryItem` for manual items; `purchasedOn` is set in `purchaseGroceryItem` at the moment of tick.
- A row's **anchor day** = `purchasedOn ?? addedOn` (a purchased manual item is anchored to its purchase day, matching "anchored to the day of the action").
- Generated, unpurchased rows carry **neither** stamp — they are recomputed every view and are not day-anchored (they live or die by scope, FR-RG-006/007).
- Both fields are optional so pre-008 documents remain valid without migration (see Back-compat below).

## PurchaseReceipt (unchanged — spec 007)

```typescript
interface PurchaseReceipt {
  inventoryItemId: string;
  quantityAdded: number;
  unit: string;
  merged: boolean;
}
```

- Still the sole source of truth for un-tick reversal **while the row is present** (FR-RG-011).
- On shed (anchor day < today), the row and its receipt are pruned together; the referenced `InventoryItem` is untouched (FR-RG-005). Retention past shed is not required (spec: no user-facing history).

## Row taxonomy and the reconcile partition

During recompute (`reconcileRollingList`, Research D2/D4) each stored item is classified once:

| Class | Predicate | Recompute treatment |
|-------|-----------|---------------------|
| **Replaceable (generated)** | `!isManuallyAdded && !isPurchased && !purchaseReceipt` | Diffed by `ingredientName` against fresh in-scope needs: keep `_id` + requantify (FR-RG-007), drop if zero/absent (FR-RG-006), insert new needs. |
| **Sticky (manual)** | `isManuallyAdded` | Preserved verbatim if anchor day ≥ today; **shed** (pruned) otherwise (FR-RG-004). |
| **Sticky (purchased)** | `isPurchased || purchaseReceipt` | Preserved verbatim (receipt intact) if anchor day ≥ today; **shed** otherwise (FR-RG-005). |

## State transitions across a day rollover

| From (state) | Event | Guard | To | Side effects |
|--------------|-------|-------|----|--------------|
| generated, in-scope | recompute (same day / new day, meal still in scope) | need still > 0 | generated, requantified | `quantity`/`sourceMealNames` overwritten; `_id` preserved (FR-RG-007) |
| generated, in-scope | recompute after all source meals pass/cook or fully covered | need == 0 | **removed** | row dropped from document (FR-RG-006) |
| manual, anchored today | recompute, same calendar day | `addedOn ≥ today` | manual, unchanged | none — byte-for-byte preserved (FR-RG-004) |
| manual, anchored today | recompute, after rollover | `addedOn < today` | **shed** | row pruned; no inventory effect |
| purchased, anchored today | recompute, same day (even if source meal date passed) | `purchasedOn ≥ today` | purchased, unchanged | receipt intact; un-tick still reverses (FR-RG-005/011) |
| purchased, anchored today | un-tick, same day | row present + receipt | unpurchased, no receipt/stamp | reverse per receipt (spec 007), clear `purchaseReceipt` + `purchasedOn` |
| purchased, anchored today | recompute, after rollover | `purchasedOn < today` | **shed** | row + receipt pruned; `InventoryItem` untouched; purchase final (FR-RG-005) |
| shed purchased row | un-tick attempt | row absent | unchanged | 404 (not offered) — reversal window closed (Research D7) |
| covered-by-owned-stock need | recompute after a prior-day purchase (stock in inventory) | netting `shortfall <= 0` | **not listed** | never re-asked to buy (FR-RG-011, netting D6) |

## MealPlan interaction (read-only)

- `IMealPlanEntry.date: Date` and `status?: EntryStatus` are read as-is. Scope predicate: `entryStatus(e) === 'planned' && e.date.getTime() >= startOfTodayCutoff().getTime()` (FR-RG-001; `entryStatus` treats absent status as `cooked`, so legacy entries already contribute nothing — FR-MC-011, no migration).
- No write to `MealPlan`.

## InventoryItem interaction (read-only)

- Netting reads the user's non-expired stock via `notExpiredQuery()` exactly as today (FR-MC-016..018 / D6). Rolling recompute **creates and edits no inventory** — so, unlike 007's tick/checkout, it never invalidates the recommendation cache.
- Stock added by an earlier-in-week purchase (now shed) nets off future needs (FR-RG-011).

## Client mirror

`packages/client/src/types/grocery-list.ts` adds optional `addedOn?: string` / `purchasedOn?: string` to the client `GroceryListItem` type (serialized as ISO strings) so the view/context stay strictly typed; the client does not need to read them for behaviour (recompute is server-side) but must not strip them on round-trip through `patchGroceryItem` edits.

## Back-compat for legacy rows

- **Missing `addedOn`/`purchasedOn` on a sticky row** (pre-008 manual/purchased items): on the first 008 recompute the row is **lazily stamped to the current recompute day** (Research D5), so it survives that day and sheds at the next rollover — no pre-008 row is surprise-dropped and no migration script runs.
- **Legacy purchased row without a `purchaseReceipt`** (spec 007 legacy): still display-only, still shed by its (backfilled) anchor; un-tick continues to 409 as in 007 (no exact reversal).
- **Generated rows** carry no anchor by design and need no backfill — they are recomputed from scratch each view.
- No index change: documents remain unique by `{userId, weekStart}`; items are reached through that document plus `_id`.
