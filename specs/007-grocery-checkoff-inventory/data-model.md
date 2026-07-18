# Data Model - Grocery Check-Off Flows Into Kitchen Inventory (`impl/nextjs`)

Phase 1 output. Storage is MongoDB via Mongoose; no new collection. This feature extends `grocery_lists.items`, reuses `inventory_items`, and reads/writes spec 005 `ingredient_aliases`.

## GroceryList item subdocument (extended)

```typescript
interface IGroceryListItem {
  _id?: string;
  ingredientName: string;
  displayName: string;
  quantity: number;
  unit: string;
  category: GroceryCategory;
  isPurchased: boolean;
  isManuallyAdded: boolean;
  sourceMealNames: string[];
  notes: string;
  purchaseReceipt?: PurchaseReceipt;
}
```

- `purchaseReceipt` is present iff the line has already added inventory under spec 007.
- Existing legacy checked lines without `purchaseReceipt` are treated as purchased display state only; they do not support exact un-check reversal.
- New manual items and generated items start with `isPurchased:false` and no receipt.

## PurchaseReceipt (embedded on the grocery item)

```typescript
interface PurchaseReceipt {
  inventoryItemId: string;  // item created or merged into, user-scoped
  quantityAdded: number;    // actual quantity added to inventory
  unit: string;             // unit added; for merges this is the inventory item's unit
  merged: boolean;          // true = incremented existing item, false = created a new item
}
```

- The receipt is the sole source of truth for reversal.
- `merged:false` reversal deletes the created item when possible; if the item was partially consumed, reversal clamps the decrement to live stock and deletes only when quantity reaches zero.
- `merged:true` reversal decrements the existing item by `quantityAdded`, clamped at live stock.

## ResolvedPurchaseInput (request-only)

```typescript
interface ResolvedPurchaseInput {
  quantity: number;
  unit: string;
  location: 'fridge' | 'freezer' | 'pantry';
  expiresAt?: string;
}
```

- Sent only when the client prompt confirms an ambiguous line or when the client has explicit resolved values.
- Server zod validation enforces finite positive quantity, bounded unit string, known location enum, and valid ISO datetime for `expiresAt`.
- `expiresAt` is applied only when explicitly supplied; automatic purchase flows never silently set expiry.

## Purchase state transitions

| From | Action | Guard | To | Side effects |
|------|--------|-------|----|--------------|
| unpurchased, no receipt | tick | line matched with `isPurchased:false` and no `purchaseReceipt` | purchased + receipt | add/merge inventory, store `purchaseReceipt`, invalidate recs cache |
| purchased with receipt | un-tick | line matched with `isPurchased:true` and `purchaseReceipt` exists | unpurchased, no receipt | reverse from receipt, clear receipt, invalidate recs cache |
| purchased with receipt | tick retry | guard fails | unchanged | 409/refetch; no inventory write |
| unpurchased, no receipt | un-tick retry | guard fails | unchanged | 409/refetch; no inventory write |
| purchased without receipt | un-tick | no exact receipt | unchanged | 409 legacy/no receipt; no guessed reversal |
| any | checkout | line without receipt only | purchased + receipt | remaining lines added once; receipted lines skipped |

## InventoryItem interaction

- Merge target query is scoped by `userId`, normalized same name, non-expired stock, and compatible unit.
- New item fields: `name`, `quantity`, `unit`, `category`, `location`, optional `expiresAt`; `expirationStatus` is never written directly.
- New items are saved through the Mongoose model so hooks compute expiration status.

## IngredientAlias reuse

```typescript
interface IIngredientAlias {
  userId: string;
  nameKey: string;
  category?: string;
  location?: string;
  unit?: string;
  expiryObservations: number[];
}
```

- Read `unit` for servings-line inference when no same-name inventory item exists.
- Read `expiryObservations` to offer one-tap expiry suggestion in `PurchasePromptSheet`.
- Write `unit` when the user confirms a prompt with a corrected unit.

## Client mirrors

`packages/client/src/types/grocery-list.ts` mirrors `purchaseReceipt`, `ResolvedPurchaseInput`, revised patch payloads, and checkout result summaries so `GroceryListContext`, `GroceryListPage`, `GroceryListItemRow`, and `PurchasePromptSheet` remain strictly typed.

## Indexes & volume

No new index required. Grocery lists are already unique by `{userId, weekStart}`; item subdocs are reached through that document plus `_id`. Receipt payload is one small object per line.
