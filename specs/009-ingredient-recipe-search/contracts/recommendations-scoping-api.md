# API Contract — Ingredient-Driven Recipe Search + Manual-Only Recommendations (`impl/nextjs`)

Phase 1 output. Spec 009 makes **two additive, backward-compatible** contract changes — an optional scope field on `POST /recommendations` and an opt-in merge flag + additive indicator on `POST /inventory`. Every other recommendation surface (the fallback ladder, cache, FR-037 `verify-links`, rate limit) is **identical to today**. All endpoints use `authenticate()`, route-level rate limiting, and Problem JSON via `withRoute`.

## POST /api/v1/recommendations — CHANGED (optional ingredient scope)

Explicit, user-triggered recommendation generation (FR-IR-001). Now accepts an **optional** ingredient selection; with none, behaviour is byte-identical to spec 001.

### What changes vs spec 001/006

- **Before**: `POST` with no meaningful body (`{}`); always generated over the whole non-expired inventory.
- **009**: `POST` accepts an optional `ingredientItemIds: string[]` (inventory `_id`s). The server:
  1. loads live non-expired inventory as today — `InventoryItem.find({ userId, ...notExpiredQuery() })`;
  2. **intersects** the provided ids with that set; a non-empty intersection **scopes** generation to the subset, an empty/all-expired intersection **falls back to the whole set** (FR-IR-010);
  3. runs the **unchanged** pipeline over the resulting item set — `ingredients` map → `buildCacheKey` (per-selection key, FR-IR-011) → `getMealRecommendations` → `groundMeals` (spec 006, FR-IR-008) → `setCached`;
  4. expiry prioritisation applies within the selection because the agent only sees the sent items (FR-IR-009, emergent).
- **Unchanged**: path, auth, the **10 req/min** rate-limit tier (`recommendations:${userId}`, shared by scoped + whole, FR-IR-011), the `{ recommendations, fallback? }` envelope, EC-01 (empty inventory → popular), EC-08 (agent down → stale-cache-else-popular), and the FR-037 hand-off to `verify-links`.

### Request

```jsonc
// Whole inventory (unchanged from today):
{}

// Scoped to a selection (FR-IR-005/006):
{ "ingredientItemIds": ["665f0a…", "665f0b…"] }
```

- Zod: `ingredientItemIds` optional; each element a 1–64-char string; array capped at 20 (grounding `MAX_INGREDIENTS`). A malformed field is ignored (treated as whole inventory), not a 400 — preserves the "no body required" contract.
- The client sends the field **only** when a selection is active; an empty selection omits it (FR-IR-007, D3).

### Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "recommendations": MealRecommendation[], "fallback"?: "popular" \| "cache" }` | generated (scoped or whole), cache hit, or a graceful fallback |
| 429 | Problem | >10 requests/min for this user (scoped + whole share the budget) |
| 401 | Problem | unauthenticated |

- No new status codes. A selection that intersects to nothing is **not** an error — it silently becomes a whole-inventory request (FR-IR-010).

### Grounding note (spec 006 reused)

`groundMeals(userId, meals, scopedItems)` re-validates the untrusted agent payload against **only the scoped items**, so every returned suggestion is grounded on the selection (SC-IR-003). A selected id that was deleted/edited/expired between selection and request is absent from the live load and silently dropped (FR-IR-008, spec EC).

## POST /api/v1/recommendations/verify-links — UNCHANGED

FR-037 lazy link verification, keyed on meal names, independent of input scope. Request (`{ mealNames: string[] }`, ≤10), response (`{ links, available }`), the 30/min tier, and the `available:false` behaviour are **exactly** as spec 001. Runs identically on scoped results (spec EC, D9).

## POST /api/v1/inventory — CHANGED (opt-in EC-03 duplicate merge)

Create an inventory item, now with an **opt-in** duplicate merge for the quick-add path (FR-IR-012).

### What changes vs today

- **Before**: always inserted a new item.
- **009**: an optional `mergeDuplicates: boolean` (default false) is added. When **true** and a same-name (`normalizeIngredientName` equality), **non-expired**, **compatible-unit** (`canSubtract || same resolved unit`) item exists, the server **increments that item's quantity** (unit-converted) instead of inserting, and returns a merge indicator. Expired or unit-incompatible same-name items are **never** targets → a new item is created (FR-IR-012, consistent with spec 007 FR-GC-005). The flag is set only by the quick-add client path, so deliberate creates elsewhere keep today's "always insert" behaviour.
- **Reuse**: the match/convert logic is the spec-007 `purchase-inventory.ts` predicates, extracted to `src/server/lib/inventory-merge.ts` and shared by both paths (no reinvention).
- **Cache**: a merge mutates inventory, so `invalidateUser(userId)` is called exactly as the existing create/update paths do — scoped and whole recommendation cache entries are dropped.

### Request

```jsonc
{
  "name": "milk",
  "quantity": 1,
  "unit": "L",
  "category": "Dairy",
  "location": "fridge",
  "mergeDuplicates": true      // quick-add only; absent/false ⇒ today's plain create
}
```

### Responses

| Status | Body | When |
|--------|------|------|
| 201 | `InventoryItem` (plain) | created new (flag absent/false, or no compatible non-expired same-name item) |
| 200 | `{ "merged": true, "item": InventoryItem, "mergedItemId": string, "addedQuantity": number }` | merged into an existing item (FR-IR-012); `addedQuantity` (in the target's unit) is what Undo subtracts |
| 400 | Problem | invalid body |
| 401 | Problem | unauthenticated |

- The `merged`/`mergedItemId`/`addedQuantity` fields appear **only** on a merge; the create case is byte-identical to today. Distinguishing 200-merge from 201-create also signals the client whether to show the Undo toast (FR-IR-013).

### Undo (client-side, transient — no new endpoint)

Undo reverses a merge through the **existing** `PUT /api/v1/inventory/:id` (subtract `addedQuantity` from current quantity, clamp ≥0) or `DELETE` (if the merge had created the row and the delta is the whole quantity) — mirroring spec 007 `reversePurchase`. No merge receipt is persisted (FR-IR-013, D7). The "Undo after further edits" edge is safe: subtracting the recorded delta never yields a negative or phantom quantity (spec EC).

## Summary of what stays identical

- The agent call, spec 006 grounding, the 15-min ingredient-keyed cache mechanism, FR-037 `verify-links`, the 10/min recommendations rate-limit tier, and EC-01/EC-08 fallbacks — **unchanged**.
- `PUT`/`DELETE /inventory/:id`, `GET /inventory` — **unchanged** (Undo reuses PUT/DELETE).
- No new endpoint, no new status code, no persisted field.
