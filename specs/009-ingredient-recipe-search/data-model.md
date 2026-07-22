# Data Model — Ingredient-Driven Recipe Search + Manual-Only Recommendations (`impl/nextjs`)

Phase 1 output. **No persisted schema change and no new collection or index.** Spec 009 changes the *input scope* and *trigger* of the recommendations pipeline and restores an inventory quick-add merge; the ingredient selection is transient (per-request), and the merge writes to the existing `inventory_items` schema. This document enumerates the request/response contract additions and the transient client-side state shapes.

## No stored-model change — and why

- **`InventoryItem`**: unchanged. The EC-03 merge (FR-IR-012) increments the `quantity` of an existing item or creates a new item through the **existing** create path; no field is added. `expirationStatus` continues to be recomputed by the pre-save hook (never written manually — CLAUDE.md §14).
- **`MealPlan` / `GroceryList`**: untouched — spec 009 does not touch planning or grocery storage.
- **Ingredient selection**: **not persisted** (spec Key Entities: "a transient, per-request set … not persisted beyond the request/session"). It exists only to scope one request and lives in client component state (D5) plus, in flight, the request body.
- **Recommendation results**: already held in-memory by the app-level `RecommendationsProvider` for the session (FR-IR-003) — no new persistence (spec Assumptions).
- **Merge Undo**: transient client snapshot only — no persisted receipt (FR-IR-013, D7). Contrast spec 007, which *does* persist a `purchaseReceipt`; a quick-add merge deliberately does not.

## Request/response contract additions

### `POST /api/v1/recommendations` — request (extended, optional)

```typescript
interface RecommendationsRequest {
  // NEW (optional). Inventory item _ids the user selected to scope the request.
  // Absent / empty / all-expired  →  whole non-expired inventory (FR-IR-004/010).
  ingredientItemIds?: string[];   // Zod: string[].min(1 char).max(64), array capped at 20
}
```

- Validated in the route handler; malformed → treated as absent (whole inventory), never a 400 for a stray field, preserving the "no body required" whole-inventory contract.
- The server intersects these ids with `InventoryItem.find({ userId, ...notExpiredQuery() })` and grounds the surviving subset (D1). Response envelope (`{ recommendations, fallback? }`) is **unchanged**.

### `POST /api/v1/recommendations` — response (unchanged)

Identical to today: `{ recommendations: MealRecommendation[], fallback?: 'popular' | 'cache' }`. Scoped and whole-inventory requests return the same shape; scoping only changes *which* meals come back.

### `POST /api/v1/inventory` — request (extended, opt-in)

```typescript
interface CreateInventoryRequest {
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  location?: Location;          // default 'fridge'
  expiresAt?: string;           // ISO 8601, optional
  // NEW (optional, default false). Set ONLY by the quick-add path (FR-IR-012).
  // true → merge into a same-name, non-expired, compatible-unit item if one exists.
  mergeDuplicates?: boolean;
}
```

### `POST /api/v1/inventory` — response (additive merge indicator)

```typescript
// When mergeDuplicates was true AND a compatible target existed:
type MergedResponse = {
  merged: true;
  item: InventoryItem;          // the existing item, quantity incremented
  mergedItemId: string;
  addedQuantity: number;        // amount added, in the target item's unit (for Undo, D7)
};

// Otherwise (flag absent/false, or no compatible non-expired same-name item):
type CreatedResponse = InventoryItem;   // exactly as today — a plain new item
```

- The `merged`/`addedQuantity` fields exist **only** on a merge; deliberate-create callers see today's plain-item response, so the change is backward-compatible. `addedQuantity` is what Undo subtracts.

### Unchanged surfaces

- `POST /api/v1/recommendations/verify-links` — FR-037 lazy phase, keyed on meal names, independent of scope (D9). No change.
- `PUT /api/v1/inventory/:id`, `DELETE /api/v1/inventory/:id` — reused verbatim by the Undo reversal (subtract-delta or delete). No change.

## Transient client-state shapes

These live in React component/context state only — never serialized to storage.

### Ingredient selection (per-surface, local — D5)

```typescript
// Kitchen select mode (InventoryPage / InventoryList) and suggestions-rail chips
// (SuggestionsRail) each hold their own:
interface SelectionState {
  active: boolean;              // select-mode on/off (Kitchen) or any chip active (rail)
  selectedItemIds: Set<string>; // inventory _ids ticked/chipped
}
// → toArray → request body `ingredientItemIds`. Empty set ⇒ field omitted (whole inventory).
```

### Session-fetched flag (existing — FR-IR-003)

No new shape. The "already fetched this session" signal is the existing `RecommendationsContext` state (`meals.length > 0` + `cachedAt`), held by the app-level `RecommendationsProvider` (`app/providers.tsx:23`). Removing the auto-load (D4) does not touch it.

### Merge Undo snapshot (transient — D7)

```typescript
interface MergeUndo {
  mergedItemId: string;
  addedQuantity: number;        // subtract this from current quantity on Undo, clamp ≥0
}
// Held in the add-flow local state and surfaced through the toast action; discarded
// when the toast auto-dismisses (~2.6s) or Undo is tapped. No persistence.
```

### Toast action (existing context, extended — D7)

```typescript
// ToastContext.showToast gains an optional action; message-only calls unchanged.
showToast(message: string, action?: { label: string; onAction: () => void }): void;
```

## Reuse map (no new matching/caching logic)

| Concern | Reused as-is | Where |
|---------|--------------|-------|
| Non-expired inventory load | `notExpiredQuery()` | `lib/expiration.ts` |
| Grounding of the scoped subset | `groundMeals(userId, meals, scopedItems)` | `lib/ingredient-grounding.ts:173` |
| Per-selection cache key | `buildCacheKey` / `getCached` / `setCached` (unchanged) | `services/recommendations-cache.ts` |
| Expiry prioritisation within selection | agent prompt (emergent, D8) | `services/meal-recommender.ts:32-33` |
| Merge eligibility (name/unit/non-expired) | `sameIngredient` / `canMergeUnits` / `convertQuantity` / `sameNameCandidates` → extracted to `inventory-merge.ts` | `lib/purchase-inventory.ts:29-52` |
| Merge reversal semantics | `reversePurchase` shape (subtract-delta / delete) | `lib/purchase-inventory.ts:160-171` |
| FR-037 links, rate limit, EC-01/EC-08 | unchanged | `controllers/recommendations.ts`, `recommendations/route.ts` |

## Back-compat

- **Old clients** POST `{}` to `/recommendations` → whole inventory, exactly as today (the new field is optional).
- **Old clients** POST to `/inventory` without `mergeDuplicates` → plain create, exactly as today (opt-in flag defaults false).
- **No migration**: nothing is added to any stored document; a merge only mutates an existing item's `quantity` through the normal save path (pre-save hook recomputes `expirationStatus`).
