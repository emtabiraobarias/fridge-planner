# Research - Grocery Check-Off Flows Into Kitchen Inventory (`impl/nextjs`)

Phase 0 output. All Technical Context unknowns resolved; decisions numbered for traceability from tasks.

## D1 - Atomic purchase guard lives in the grocery-list controller

**Decision**: `patchGroceryItem` performs purchase transitions with a conditional `findOneAndUpdate` on `{userId, weekStart, items: {$elemMatch: {_id: itemId, isPurchased: false, purchaseReceipt: {$exists: false}}}}` and `arrayFilters` for the target item. Only the transition winner calls the purchase inventory lib and writes the receipt. A duplicate/concurrent tick that finds the item already purchased returns 409 with a refetch-friendly Problem body.
**Rationale**: The controller already owns item PATCH semantics and has authenticated `userId`; keeping the guard beside the state transition mirrors spec 006's cook guard and makes handler tests exercise the real route.
**Alternatives considered**: Guard inside `purchase-inventory.ts` - rejected because the lib should not mutate grocery-line state. Mongo transactions - rejected because the app does not require a replica set and spec 006 accepted conditional guards over multi-doc transactions.

## D2 - Purchase engine: new pure server lib with receipt semantics

**Decision**: Add `packages/client/src/server/lib/purchase-inventory.ts` with `applyPurchase(userId, line, resolved?)` and `reversePurchase(userId, receipt)`. It resolves merge targets, creates/updates inventory, and returns `PurchaseReceipt`. Reversal uses only the receipt.
**Rationale**: This mirrors `ingredient-consumption.ts`, isolates edge cases (merge compatibility, expired-stock exclusion, clamping), and lets unit tests cover receipt behavior without HTTP.
**Alternatives**: Inline inventory writes in `controllers/grocery-lists.ts` - rejected for complexity and duplicate checkout/tick logic.

## D3 - Prompt-vs-auto decision happens on the client; server re-validates

**Decision**: `GroceryListPage`/`GroceryListContext` decide whether a servings line is ambiguous because the client already holds the grocery item, live inventory context, and `QuickAddContext` alias cache. Auto tick sends no prompt values for real-amount or confidently inferred lines; prompt confirm sends resolved `{quantity, unit, location, expiresAt?}` values. The server validates every value and applies FR-GC-004/005/006.
**Rationale**: The server should never prompt; the client has enough context to avoid an extra round trip for common cases. Server validation preserves trust boundaries.
**Alternatives**: Server returns "needs prompt" from PATCH - rejected because it makes the state transition multi-step and complicates atomicity.

## D4 - Receipt shape is embedded on the grocery item

**Decision**: `IGroceryListItem` gains `purchaseReceipt?: { inventoryItemId: string; quantityAdded: number; unit: string; merged: boolean }`, present iff the line was added through tick/checkout under spec 007.
**Rationale**: Reversal is line-local; an embedded receipt is small, query-free, and directly mirrors spec 006 consumption receipts.
**Alternatives**: Separate purchase receipts collection - rejected as unnecessary join overhead.

## D5 - Amount mapping and merge rules

**Decision**: Real-amount lines add exactly their `quantity` and `unit`. Servings lines infer unit from first confident source: same-name non-expired compatible inventory item, then learned alias unit. No source means ambiguous for mid-shop tick (prompt) or neutral default for checkout. Merge target = same normalized name, same user, non-expired, compatible unit; expired or incompatible target creates a new inventory item.
**Rationale**: Directly implements FR-GC-004/005 and keeps expired stock from masking fresh purchases.
**Alternatives**: Always create new items - rejected by EC-03 and duplicate handling. Always merge same names regardless of unit - rejected because it corrupts quantities.

## D6 - Category -> location default should be shared with quick-add behavior

**Decision**: Lift the existing quick-add category/default-location table into a reusable client/server-safe helper or duplicate only through a single exported mapping module used by quick-add and purchase. New purchase-created inventory items default location from this mapping unless the prompt supplies a value.
**Rationale**: FR-GC-006 requires category-based location defaults; inventing a second table would drift from existing quick-add behavior.
**Alternatives**: Hard-code `fridge` in the grocery controller - rejected because existing quick-add already distinguishes pantry/freezer defaults.

## D7 - Alias memory reuse

**Decision**: Read `ingredient_aliases.unit` and `expiryObservations` for inference and prompt suggestions. When the user confirms a prompt with an adjusted unit, call the existing `/api/v1/quick-add/aliases/:nameKey` path to persist the learned unit. Expiry suggestions are offered from established observations and applied only when the user taps them.
**Rationale**: This is the intended reuse of spec 005 memory and keeps unit corrections useful for later one-tap grocery ticks.
**Alternatives**: New grocery-specific alias collection - rejected as duplication.

## D8 - Checkout skip logic reuses the same purchase engine

**Decision**: `completeGroceryList` processes only receipt-less lines. It applies the same `applyPurchase()` rules to each, with promptless defaults for ambiguous servings lines, stores a purchase receipt for each added line, marks every line purchased, and returns created/updated receipt summary plus errors.
**Rationale**: SC-GC-005 requires mid-shop ticks plus checkout to create exactly one inventory addition per line. Reusing the purchase lib avoids two divergent code paths.
**Alternatives**: Keep the current client-submitted checkout payload as authoritative - rejected because it cannot know which lines were already receipted and duplicates inventory.

## D9 - Recommendation cache invalidation

**Decision**: `patchGroceryItem` and `completeGroceryList` call `invalidateUser(userId)` after any successful purchase add or reversal.
**Rationale**: Inventory changes outside the Kitchen screen must affect later meal suggestions (FR-GC-012), mirroring spec 006 cook/uncook behavior.
**Alternatives**: Wait for inventory screen refresh - rejected; recommendations cache is server-side and user-scoped.

## D10 - Wrong-state responses

**Decision**: Return 409 Problem JSON for wrong-state transitions: tick already purchased, un-tick not purchased/no receipt, un-tick completed-list out of scope. Unknown item remains 404; invalid `itemId`/body remains 400.
**Rationale**: Matches spec 006's lifecycle semantics and gives the client a simple refetch path on races.
