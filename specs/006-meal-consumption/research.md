# Research — Inventory-Grounded Meal Consumption (`impl/nextjs`)

Phase 0 output. All Technical Context unknowns resolved; decisions numbered for traceability from tasks.

## D1 — Agent output schema: extend in place, zero extra LLM calls

**Decision**: Revise the meal-recommender system prompt so each meal's `usesIngredients` becomes an array of objects `{inventoryItemId, name, quantityToConsume, unit}`; `expiringIngredients`/`missingIngredients` stay name arrays. The agent already receives the inventory JSON including `_id`, `quantity`, `unit`, so this is a response-format change only (FR-MC-005: no added round-trips).
**Rationale**: The grounding data is already in the agent's context; asking for it in the output is free. A separate "grounding pass" LLM call would double latency and cost per recommendation.
**Alternatives considered**: (a) second LLM grounding call — rejected (FR-MC-005, cost); (b) pure server-side name matching with no agent change — rejected (amounts would be invented server-side; the agent knows the recipe's rough quantities); (c) embeddings similarity — banned (CLAUDE.md §14).

## D2 — Untrusted-payload validation: dedicated `ingredient-grounding.ts` lib

**Decision**: New pure server lib validates the agent payload with zod (shape, positive finite amounts, string lengths) and resolves each ingredient through tiers: **T1** `InventoryItem.findOne({_id, userId})` (never trust the ID alone — always user-scoped, FR-036/FR-MC-002); **T2** `normalizeIngredientName` equality against the user's live inventory (the existing `ingredient-matcher`); **T3** learned pairing (D3). Unresolved → `resolution:'unresolved'` and the name joins `missingIngredients`. Amounts clamped to owned stock via `normalizeUnit`/`canSubtract`; incompatible units keep the item match but mark the amount unusable (cook review pre-fills 1 unit, per FR-MC-009 legacy rule).
**Rationale**: A single choke-point lib is testable without HTTP, keeps the controller thin, and gives the hostile-input corpus one home.
**Alternatives**: inline validation in the controller — rejected (untestable sprawl, complexity limit).

## D3 — Tier-3 learned pairing: reuse `ingredient_aliases` + parse-assist pattern

**Decision**: Add optional `inventoryName: string` to the spec-005 `IIngredientAlias` (the "named for backlog #2 reuse" moment). Lookup key = `nameKey` (normalized ingredient name from the suggestion). On miss, `services/alias-pairing.ts` makes one `gpt-4o-mini` structured-output call ("which of these inventory item names does '<ingredient>' refer to, or none") zod-gated to the user's actual item names, cached in-memory 1h (same TTL/shape as `parse-assist.ts`), and persists a hit to the alias doc. Absent `OPENAI_API_KEY` or any error → fail-open to unresolved (never blocks, FR-MC-004).
**Rationale**: Same collection, same scoping guarantees (FR-IQ-018), same service pattern already proven in 005; per-pair persistence makes repeat lookups free (bounded cost).
**Alternatives**: new collection — rejected (duplicate of an existing per-user name-keyed store); embeddings — banned.

## D4 — Where grounding runs: post-agent in the recommendations controller, re-clamped at cook

**Decision**: Ground once in `controllers/recommendations.ts` right after the agent responds (before the cache write, so cached meals are grounded); popular-recipe fallbacks and stale-cache paths pass through ungrounded. At cook time the confirmed amounts are **re-validated and clamped against live inventory** inside the consumption transaction — grounding at delivery is advisory; consumption-time state is authoritative (FR-MC-002 "at the moment of consumption").
**Rationale**: Delivery-time grounding feeds the display (US1) and the review pre-fill; cook-time re-clamping handles the inventory drift between suggestion and cooking (spec edge case).

## D5 — Entry lifecycle storage: fields on the entry subdoc; missing status = legacy cooked

**Decision**: Extend the `meal_plans` entry subdocument with `status: 'planned' | 'cooked'`, `cookedAt?: Date`, `consumedItems?: ConsumptionReceiptLine[]`. New entries are written `status:'planned'` explicitly. Entries with **no** `status` field are treated as `cooked` everywhere they're read (FR-MC-011 cutover — their deduction happened at plan time under the old rule) and cannot be un-cooked (no receipt). No migration script.
**Rationale**: Zero-downtime cutover; the Mixed-typed `meal` snapshot precedent shows old/new shapes already coexist in this collection; a migration adds an ops step for no behavioural gain.
**Alternatives**: backfill migration marking legacy entries cooked — rejected (needs a deploy-coupled script; the read-time interpretation is total and testable).

## D6 — Atomicity & idempotency: conditional single-document update, no transactions

**Decision**: The planned→cooked transition is one `findOneAndUpdate({userId, weekStart, entries: {$elemMatch: {slotId, status:'planned'}}}, {$set: {entries.$[e].status:'cooked', …}}, {arrayFilters:[{'e.slotId': slotId, 'e.status':'planned'}]})`. Only a successful transition proceeds to deduction; a losing racer/retry matches nothing → 409 Problem (`already cooked`). Un-cook mirrors it with `status:'cooked'` + `consumedItems:{$exists:true}` as the guard. Inventory writes then run per-item (each item update is itself atomic); a mid-flight crash can leave the entry cooked with its receipt recorded **before** deductions? No — order is: transition entry → deduct items (collecting actuals) → write receipt onto the entry. A crash between deduction and receipt-write is the residual risk; accepted for a single-household app (documented; Mongo multi-doc transactions need a replica set the dev/prod single-node setups don't guarantee).
**Rationale**: Meets SC-MC-003 (exactly-once under retry/concurrency) with the tools the deployment actually has; matches the codebase's no-transaction posture.
**Alternatives**: Mongo transactions — rejected (replica-set requirement, over-engineering for the failure window); app-level locks — rejected (multi-instance unsafe, and E5 defers Redis).

## D7 — Consumption engine v2: receipts in, exact restore out

**Decision**: Rewrite `lib/ingredient-consumption.ts`: `consumeConfirmed(userId, lines) → ConsumptionReceiptLine[]` — per line, resolve the target item (by `inventoryItemId` first, then legacy name match for ungrounded snapshots), clamp to live quantity, decrement or delete-at-zero capturing `depletedSnapshot` (name/quantity/unit/category/location/expiresAt — never `expirationStatus`, the pre-save hook owns it), record actual deducted amount. `restoreFromReceipt(userId, lines)` — increment existing items / re-create depleted ones via `new InventoryItem(snapshot).save()`. Zero-amount lines are recorded as `quantityConsumed: 0` (not consumed). The old `consumeIngredients`/`restoreIngredients` are deleted with their call sites (POST/DELETE/PUT lose all inventory side-effects, FR-MC-006).
**Rationale**: Receipts are the spec's source of truth for reversal (FR-MC-012/013); building restore on them removes the "can't resurrect" limitation the old code documents in-line.

## D8 — API shape: entry-level PATCH with an action discriminator

**Decision**: `PATCH /api/v1/meal-plans/:weekStart/entries/:slotId` with `{action:'cook', consumption: [{inventoryItemId?, name, quantity, unit}]}` or `{action:'uncook'}` (zod discriminated union). Responses return the updated plan (+ the receipt on cook). 409 for wrong-state transitions; 404 unknown slot; legacy cooked entries un-cook → 409 with a distinct detail. Default rate limit (100/min). Client: `services/meal-plans.ts` gains `cookEntry`/`uncookEntry`; `MealPlanContext` exposes actions and patches entry state from the response.
**Rationale**: The slot resource already exists (DELETE lives there); a status transition is a partial update — PATCH with an action verb mirrors REST practice without inventing a sub-resource. Matches the roadmap analysis sketch.
**Alternatives**: `POST …/:slotId/cook` + `/uncook` sub-resources — acceptable but two routes for one state machine; rejected for surface area.

## D9 — Quantity-aware grocery generation: grounded lines net, everything else falls back

**Decision**: `generateGroceryList` v2: consider only entries whose effective status is `planned` (cooked meals' consumption is already reflected in inventory; legacy no-status entries count as cooked and are excluded — their needs are stale by definition). Two line sources: **(a)** grounded ingredients — sum `quantityToConsume` per canonical name (unit-family-aware via `normalizeUnit`), net owned non-expired stock with the existing `netNeeded`, keep shortfall lines with real amounts, omit fully covered; **(b)** `missingIngredients` + ungrounded names — the existing servings model, untouched. Mixed-family sums for one canonical name (e.g. g + L) collapse that line to servings (FR-MC-017 fallback). The dormant Phase C subtraction code finally activates for (a); FR-008 stays honoured because the inventory feed is already `notExpiredQuery()`-filtered.
**Rationale**: Reuses `netNeeded`/`canSubtract` exactly as their doc-comments anticipated; the planned-only filter implements FR-MC-016's "planned meals" wording and is deliberately status-based, not date-based (date exclusion is roadmap backlog #4).

## D10 — UI: review sheet in the calendar detail modal

**Decision**: `MealDetailModal` gains a "Mark cooked" action opening `ConsumptionReviewSheet` (new component): one row per resolved ingredient — name, pre-filled amount + unit, stepper + numeric input, zero allowed; unresolved ingredients shown read-only as "not from your kitchen". Confirm → `cookEntry`. Cooked entries: tile shows a cooked badge (icon + label); modal shows cookedAt + the receipt list (FR-MC-015) and an "Un-cook" action (hidden for legacy receipt-less entries). Accept-defaults path: open modal → Mark cooked → Confirm = 3 interactions (SC-MC-006).
**Rationale**: The modal already exists (FR-024 restored 2026-07-16) and is the entry's natural detail surface; a sheet matches the Organic design system's existing EditItemSheet pattern.
