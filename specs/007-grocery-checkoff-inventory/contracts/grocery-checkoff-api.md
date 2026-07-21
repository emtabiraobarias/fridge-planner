# API Contract - Grocery Check-Off (`impl/nextjs`)

Phase 1 output. Revised grocery-list item PATCH and checkout semantics. All endpoints use `authenticate()`, route-level rate limiting, and Problem JSON via `withRoute`.

## PATCH /api/v1/grocery-lists/:weekStart/items/:itemId

Existing item update endpoint gains purchase-aware transition semantics.

### Request - edit fields only

```json
{
  "displayName": "Milk",
  "quantity": 2,
  "unit": "L",
  "category": "Dairy",
  "notes": "A2 if available"
}
```

Field edits do not change inventory and must not alter `purchaseReceipt`.

### Request - tick purchased, promptless

```json
{
  "isPurchased": true
}
```

Used for real-amount lines and servings lines with confident inference. The server maps quantity/unit per FR-GC-004 and applies merge-or-create rules per FR-GC-005.

### Request - tick purchased with resolved prompt values

```json
{
  "isPurchased": true,
  "resolvedPurchase": {
    "quantity": 2,
    "unit": "pack",
    "location": "pantry",
    "expiresAt": "2026-07-25T00:00:00.000Z"
  }
}
```

`resolvedPurchase` is accepted only with `isPurchased:true`. It is the user-confirmed prompt payload for ambiguous servings lines.

### Request - un-tick purchased

```json
{
  "isPurchased": false
}
```

Uses the stored `purchaseReceipt` to reverse exactly. The client sends no quantities for reversal.

### Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "groceryList": <GroceryList>, "receipt"?: PurchaseReceipt }` | field edit, purchase, or unpurchase succeeded |
| 400 | Problem | invalid `weekStart`, `itemId`, body, or resolved purchase values |
| 404 | Problem | no grocery item with that id for the authenticated user/week |
| 409 | Problem `already purchased` | duplicate/concurrent tick lost the atomic guard |
| 409 | Problem `not purchased` | duplicate/concurrent un-tick or un-tick without receipt |
| 409 | Problem `cannot reverse without purchase receipt` | legacy purchased line has no receipt |
| 401 | Problem | unauthenticated |

Side effects on successful purchase/unpurchase: inventory writes, `purchaseReceipt` write/clear, and `invalidateUser(userId)`.

## POST /api/v1/grocery-lists/:weekStart/complete

Checkout becomes "mark remaining + finalize." It skips already receipted lines.

### Request

```json
{
  "items": [
    {
      "itemId": "665f...",
      "name": "Milk",
      "quantity": 2,
      "unit": "L",
      "category": "Dairy",
      "location": "fridge",
      "expiresAt": "2026-07-25T00:00:00.000Z"
    }
  ]
}
```

The existing client-submitted `items` array is tolerated during the cascade, but the server is authoritative: it loads the grocery list, skips lines with `purchaseReceipt`, and only applies purchase logic to receipt-less lines. Ambiguous receipt-less servings lines use promptless defaults; checkout never opens per-item prompts.

### Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "created": [...], "updated": [...], "skipped": number, "errors": string[] }` | checkout processed |
| 400 | Problem | invalid body or `weekStart` |
| 404 | Problem | no grocery list for week |
| 401 | Problem | unauthenticated |

`created` contains newly created inventory items; `updated` contains merged inventory item ids/quantities; `skipped` counts lines already carrying `purchaseReceipt`. Successful purchase lines store receipts and are marked purchased.

## GroceryList response shape

Each item may include:

```json
{
  "_id": "665f...",
  "displayName": "Milk",
  "quantity": 2,
  "unit": "L",
  "category": "Dairy",
  "isPurchased": true,
  "purchaseReceipt": {
    "inventoryItemId": "6660...",
    "quantityAdded": 2,
    "unit": "L",
    "merged": false
  }
}
```

Clients should treat `purchaseReceipt` presence as "already added to Kitchen." Purchased legacy rows without receipt remain display-only and cannot be reversed exactly.
