# API Contract — Meal Consumption (`impl/nextjs`)

Phase 1 output. One new operation + two revised payload shapes. All endpoints: `authenticate()` (Bearer JWT / dev seam), Problem JSON (RFC 7807) errors via `withRoute`, rate limit 100/min unless noted.

## PATCH /api/v1/meal-plans/:weekStart/entries/:slotId  (NEW)

Entry lifecycle transition (cook / un-cook). Route file already hosts DELETE.

### Request — cook

```json
{
  "action": "cook",
  "consumption": [
    { "inventoryItemId": "665f…", "name": "Chicken Thighs", "quantity": 500, "unit": "g" },
    { "name": "Soy Sauce", "quantity": 0, "unit": "ml" }
  ]
}
```

- `consumption` = the user-confirmed review (FR-MC-009): one line per resolved ingredient; `quantity: 0` = marked not consumed; lines for ingredients the review showed as "not from your kitchen" are omitted by the client (server also ignores unmatchable lines, recording nothing for them).
- Zod: discriminated union on `action`; `consumption` array ≤ 20; `quantity` finite ≥ 0; `inventoryItemId` optional (legacy/name-matched lines).
- Server re-validates every line against **live** inventory (user-scoped) and clamps to owned stock (FR-MC-002); the receipt records actuals.

### Request — un-cook

```json
{ "action": "uncook" }
```

### Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "plan": <MealPlan>, "receipt": ConsumptionReceiptLine[] }` | cook succeeded (receipt echoed for the modal) |
| 200 | `{ "plan": <MealPlan> }` | un-cook succeeded (entry back to `planned`, receipt cleared) |
| 400 | Problem | invalid body (zod detail) |
| 404 | Problem | no entry with that `slotId` in the user's week |
| 409 | Problem `already cooked` / `not cooked` | idempotency guard lost the race / wrong-state transition (client treats cook-409 as success-already-done and refetches) |
| 409 | Problem `cannot un-cook a pre-existing entry` | legacy cooked entry without a receipt (FR-MC-011) |
| 401 | Problem | unauthenticated |

Side effects on success: inventory writes (deduct/restore incl. depleted-item re-creation), recs cache `invalidateUser(userId)` (FR-MC-010).

## Existing meal-plan endpoints — behavioural contract change (no body change)

| Endpoint | Change |
|----------|--------|
| POST `…/entries` | **No longer consumes inventory** (FR-MC-006). New entries stored `status:'planned'`. |
| DELETE `…/entries/:slotId` | **No longer restores inventory** (FR-MC-006/014) — pure entry removal for both planned and cooked. |
| PUT `…/:weekStart` | **No longer net-diffs inventory.** Server preserves stored `status`/`cookedAt`/`consumedItems` per surviving `slotId`; lifecycle fields in the request body are ignored (a client cannot cook via PUT). |
| GET `…?weekStart=` | Entries now carry `status` (absent = legacy cooked), `cookedAt`, `consumedItems`. |

## POST /api/v1/recommendations — revised meal payload (additive)

Each meal gains grounded ingredients (validated server-side per research D2 before caching/return):

```json
{
  "mealName": "Chicken Adobo",
  "usesIngredients": ["Chicken Thighs", "Onion"],
  "groundedIngredients": [
    { "inventoryItemId": "665f…", "name": "Chicken Thighs", "quantityToConsume": 500, "unit": "g", "resolution": "direct" },
    { "inventoryItemId": "6660…", "name": "Onion", "quantityToConsume": 1, "unit": "count", "resolution": "fuzzy" }
  ],
  "expiringIngredients": ["Chicken Thighs"],
  "missingIngredients": ["Soy Sauce"]
}
```

- `usesIngredients` remains (derived from grounded names) — back-compat for stored snapshots and existing UI.
- Popular-recipe fallbacks and stale-cache serves may omit `groundedIngredients` (cook falls back to legacy name matching, FR-MC-009).
- Unresolved agent references never surface: they are re-resolved or moved to `missingIngredients` (FR-MC-003).

## Agent contract (Holodeck meal-recommender)

`instructions/system-prompt.md` response format: `usesIngredients` becomes `[{ "inventoryItemId": "<_id from the provided inventory>", "name": "...", "quantityToConsume": <number>, "unit": "<the item's unit>" }]`. Rules added: IDs MUST be copied verbatim from the provided inventory JSON; `quantityToConsume` MUST NOT exceed the item's quantity; never invent items. Server treats all of it as untrusted regardless. `agent.yaml` test case updated to assert grounded output. Requires an `agent-v*` image release; the app tolerates both schema versions during rollout.
