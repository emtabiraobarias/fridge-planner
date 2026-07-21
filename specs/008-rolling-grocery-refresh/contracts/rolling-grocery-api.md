# API Contract — Daily Rolling Grocery-List Refresh (`impl/nextjs`)

Phase 1 output. Spec 008 changes **only** the read/generation semantics of the grocery-list endpoints; the spec-007 mutation surfaces (`PATCH .../items/:itemId`, `POST .../complete`) keep their request/response shapes. All endpoints use `authenticate()`, route-level rate limiting, and Problem JSON via `withRoute`. "Today" is always derived **server-side** (Research D3) — no endpoint accepts a client date.

## GET /api/v1/grocery-lists/:weekStart — CHANGED (recompute-on-view)

Rolling recompute-on-view. Every GET re-scopes the list to the current day.

### What changes vs spec 007

- **007**: generated the list lazily **only when no document existed**; thereafter GET returned the stored document verbatim.
- **008**: GET **always** runs `reconcileRollingList(existing, mealPlan, inventory, asOf)` (FR-RG-002/008):
  - generated needs are recomputed from `planned` entries dated **today-or-later** only (FR-RG-001); entries before today contribute nothing whether cooked or skipped;
  - generated rows are reconciled by `ingredientName` — surviving rows keep their `_id` and are requantified/re-sourced (FR-RG-007), zeroed rows are removed (FR-RG-006), new needs are inserted;
  - manual and purchased rows anchored to **today** are preserved verbatim (receipt intact); rows anchored **before today** are **shed** (pruned) (FR-RG-004/005);
  - the reconciled document is persisted (extends 007's lazy upsert), so manual and force refresh converge.
- **Unchanged**: path, auth, rate-limit tier (100/min), and the `{ groceryList }` response envelope. When no meal plan and no stored list exist, still returns `{ groceryList: null }`.

### How "today" is derived

Server-only: `startOfTodayCutoff()` takes the host's **local** calendar day and projects it onto the entries' **UTC-midnight** axis (`Date.UTC(y, m, d)`); an entry is in scope iff `entry.date >= cutoff`. A today-dated entry stays in scope for the whole day (FR-RG-010). The client sends no date; it only chooses the week via `:weekStart`.

### Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "groceryList": <GroceryList> \| null }` | recompute succeeded (null when no plan and no stored list) |
| 400 | Problem | `weekStart` is not a valid ISO date |
| 401 | Problem | unauthenticated |

No error status is introduced for scope changes — shedding/removal/requantify are silent recompute outcomes.

## POST /api/v1/grocery-lists/:weekStart/generate — CHANGED (same rolling path, forced)

Force-regenerate. Now shares the exact `reconcileRollingList` path with GET.

### What changes vs spec 007

- **007**: preserved `isManuallyAdded` items and regenerated the rest from the whole week's plan.
- **008**: applies the same today-onwards scope (FR-RG-001), the same generated-row reconcile (FR-RG-006/007), and the same day-anchored shed of stale manual/purchased rows (FR-RG-004/005). Manual and purchased rows anchored **today** are preserved (receipt intact); those anchored **before today** are shed. Result is byte-identical to what GET produces at the same instant (FR-RG-002 scenario 2).
- **Unchanged**: path, auth, rate-limit tier, `{ groceryList }` envelope, and the 404 when no meal plan exists for the week.

### Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "groceryList": <GroceryList> }` | regenerated within today's scope |
| 400 | Problem | invalid `weekStart` |
| 404 | Problem | no meal plan for this week |
| 401 | Problem | unauthenticated |

## PATCH /api/v1/grocery-lists/:weekStart/items/:itemId — UNCHANGED surface, availability-scoped

The spec-007 purchase/edit/un-tick transition is **identical at the wire level**. Request bodies (`{ isPurchased: true }`, `{ isPurchased: true, resolvedPurchase }`, `{ isPurchased: false }`, field edits) and the response envelope (`{ groceryList, receipt? }`) are exactly as in the 007 contract.

### The only 008 differences (behavioural, not surface)

- On a successful **tick** (`isPurchased:true`), the server additionally stamps `purchasedOn = now` so the row is anchored to its purchase day (FR-RG-005). No new request field.
- **Un-tick availability is day-scoped** (FR-RG-005/011): reversal is offered only while the purchased row is still on the rolling list (same day). Un-ticking a row that has already **shed** returns **404 Not Found** (the row is gone) rather than the 409 that a same-day duplicate/receipt-less un-tick returns. The client treats 404 and 409 alike — refetch, reversal not available.
- Within a day, an intervening recompute never detaches a receipt from its row (reconcile copies sticky rows verbatim, FR-RG-011).

| Status | Body | When |
|--------|------|------|
| 200 | `{ "groceryList": <GroceryList>, "receipt"?: PurchaseReceipt }` | edit / tick / un-tick succeeded (tick sets `purchasedOn`) |
| 404 | Problem | item not found — includes a row that has already **shed** (008) |
| 409 | Problem | same-day duplicate/concurrent tick, or un-tick without receipt (as 007) |
| 400 / 401 | Problem | invalid body/ids / unauthenticated (as 007) |

## POST /api/v1/grocery-lists/:weekStart/complete — UNCHANGED surface

Receipt-aware checkout is **identical to spec 007**: the server loads the list, skips receipted rows, applies purchase rules to receipt-less rows, stores receipts, and marks rows purchased. Request (`{ items?: [...] }`, tolerated/authoritative-server) and response (`{ created, updated, skipped, errors }`) shapes are unchanged.

### 008 note

Checkout runs against the **rolling** list — i.e. the already-recomputed, today-scoped set of rows (past-meal generated needs are gone before checkout sees them). Rows purchased at checkout are stamped `purchasedOn = now` like any tick, so they follow the same daily shed. No request/response field changes.

## GroceryList response shape (item)

Each item may now include the two day-anchor stamps in addition to the 007 fields:

```json
{
  "_id": "665f...",
  "displayName": "Milk",
  "quantity": 2,
  "unit": "L",
  "category": "Dairy",
  "isPurchased": true,
  "isManuallyAdded": false,
  "sourceMealNames": ["Creamy Pasta"],
  "purchaseReceipt": { "inventoryItemId": "6660...", "quantityAdded": 2, "unit": "L", "merged": false },
  "purchasedOn": "2026-07-22T00:00:00.000Z",
  "addedOn": null
}
```

- `purchasedOn` / `addedOn` are informational for clients; behaviour (scope, shed) is enforced server-side. Generated unpurchased rows carry neither.
- `purchaseReceipt` still means "already added to Kitchen"; a purchased row present on the list can be reversed **today only** (FR-RG-005).
