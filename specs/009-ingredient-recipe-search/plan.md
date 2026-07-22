# Implementation Plan: Ingredient-Driven Recipe Search + Manual-Only Recommendations (`impl/nextjs`)

**Branch**: `009-implement` · **Date**: 2026-07-23 · **Spec**: [`spec.md`](spec.md)
**Input**: Feature specification from `specs/009-ingredient-recipe-search/spec.md`

> **Per-branch plan** (not on `main`). This is the `impl/nextjs` implementation plan for shared spec `009`, which amends spec 001 FR-012/FR-014 + the EC-03 quick-add duplicate handling (per FR-IR-014). It changes **only the input scope and the trigger** of the recommendations pipeline that specs 001/006 already shipped: the whole-inventory auto-load becomes a manual, optionally ingredient-scoped request, and a small EC-03 quick-add auto-merge rides along. Everything downstream — the Holodeck agent call, spec 006 grounding, the 15-min ingredient-keyed cache, FR-037 lazy links, the 10/min rate limit, EC-01 empty-inventory fallback — is reused **unchanged**.

## Summary

Deliver spec 009 in four independently testable increments matching the spec stories, plus a cascade phase. **IR1** removes the meal-recommendation auto-load and replaces it with an explicit "Get Recommendations" call-to-action + empty state, with already-fetched results persisting for the session (US1) — a client-only change, independently shippable. **IR2** adds ingredient scoping: an optional `ingredientItemIds?: string[]` on `POST /recommendations` that the server intersects with the user's live non-expired inventory and grounds the same way whole-inventory does, reached from two converging entry points (Kitchen select mode + suggestions-rail chips) that both call one service path (US2). **IR3** restores the EC-03 quick-add duplicate merge server-side, reusing spec 007's same-name/non-expired/compatible-unit matcher, with a transient client-side Undo (US3). **IR4** verifies, cascades spec 001 + `CLAUDE.md` on `main`, and hands off. **No new npm dependency, no schema change, no new collection, no new React context** — scoping falls out of the existing cache key, and the merge reuses existing inventory storage and matching libs.

## Technical Context

**Language/Version**: TypeScript (strict) on Node 20 / React 18 / Next.js 15 App Router — one process on `:3000`.
**Primary Dependencies**: existing only — Mongoose 8, Zod, Tailwind, `lucide-react`. **No new npm dependencies** (no embeddings/vector store — CLAUDE.md §14). No scheduler/queue.
**Storage**: MongoDB via Mongoose — **no schema change**. The ingredient selection is transient (per-request, never persisted, spec Key Entities). The EC-03 merge writes to the existing `inventory_items` schema through the existing create/update paths.
**Testing**: Vitest node-env harness (`tests/server/`, `mongodb-memory-server`) — `tests/server/recommendations.test.ts` extended for the scoped-subset filter + per-selection cache hit + empty/only-expired → whole-inventory fallback; `tests/server/inventory.test.ts` extended for the EC-03 merge/indicator + non-merge (expired/incompatible) cases; a focused unit test for the extracted merge matcher. RTL for the removed auto-load (`RecommendationsPanel`), the CTA/empty state, the two selection surfaces, and the Undo toast.
**Target Platform**: existing web app (mobile-first, 320–1920px); single-user LAN deployment.
**Project Type**: web — single `packages/client` package (UI + Route Handlers + `src/server`).
**Performance Goals**: fewer agent calls, not more — SC-IR-001 requires **zero** recommendation fetches on a fresh visit; scoping reduces the ingredient set sent to the agent; per-selection cache hits (SC-IR-005) avoid repeat calls.
**Constraints**: server modules start with `import 'server-only'`; extensionless `@server/*` imports; thin handlers over controllers; Problem JSON via `problem()`/`withRoute`; complexity ≤10; Context + hooks only (no new store); never write `expirationStatus`; `notExpiredQuery()` gates both grounding stock and merge eligibility; the recommendations cache module is **not** modified.
**Scale/Scope**: single-household inventory; a selection is a handful of item ids; the merge reads the user's non-expired items (already loaded for grounding/generation elsewhere).

## Constitution Check

*Gate evaluated against root `constitution.md` + `CLAUDE.md` §7/§8/§14. Re-check after Phase 1 design: PASS.*

- **Strict typing / no `any` / explicit return types** PASS — the optional `ingredientItemIds` is a typed Zod-validated `string[]`; the create-inventory merge indicator is a typed union on the response; the Undo snapshot is a typed transient client shape.
- **TDD** PASS — every story phase starts with failing tests citing FR-IR numbers before implementation (scoped-subset filter, per-selection cache hit, merge vs non-merge, Undo reversal).
- **Coverage ≥70% client** PASS — the merge matcher is unit-tested; the controller scope/merge paths get handler tests; the removed auto-load + CTA + selection + Undo get RTL tests; full suite is the final gate.
- **Context + hooks only** PASS — **no new context**. Results already live in the app-level `RecommendationsProvider` (session persistence, FR-IR-003); selection state is transient and local to each surface; the Undo affordance extends the existing `ToastContext` with an optional action rather than adding a store.
- **Mobile-first, WCAG 2.1 AA** PASS — select-mode checkboxes and filter chips are labelled, keyboard-operable, and not color-only; the Undo toast has an actionable, focusable control; the empty-state CTA is a real button.
- **API-first, RFC 7807, versioned paths, rate limiting** PASS — `POST /recommendations` keeps its path, envelope, 10/min tier, and full fallback ladder; it gains one optional body field. `verify-links` is untouched. `POST /inventory` keeps its path and gains an opt-in merge flag + an additive response field.
- **Reuse over rebuild (spec 009 central theme)** PASS — the agent call (`getMealRecommendations`), grounding (`groundMeals`), cache (`buildCacheKey`/`getCached`/`setCached`), FR-037 (`verifyRecipeLinks`), rate limit, and EC-01/EC-08 fallbacks are all reused verbatim; the merge reuses `purchase-inventory.ts`'s matching predicates rather than reinventing them.
- **`expirationStatus` never set manually** PASS — the merge increments `quantity` on an existing item (pre-save hook recomputes status) or creates via the existing model path; no direct status writes.
- **No embeddings / no new service / no state library** PASS (CLAUDE.md §14) — scoping is a subset filter over data already in memory; no ChromaDB/Ollama, no new Route-Handler service, no Redux/Zustand.
- **Branch discipline** PASS — spec came from the shared spec branch; planning/tasks are per-branch `impl/nextjs` artifacts. Spec 001 FR-012/FR-014 + EC-03 revisions land on `main` (FR-IR-014).

## Project Structure

### Documentation (this feature)

```text
specs/009-ingredient-recipe-search/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── recommendations-scoping-api.md
└── tasks.md            # authored in a later step, not here
```

### Source Code (repository root)

```text
packages/client/
├── app/api/v1/
│   ├── recommendations/route.ts              # POST — parse body, pass optional ingredientItemIds (IR2)
│   │   └── verify-links/route.ts             # UNCHANGED (FR-037 lazy phase)
│   └── inventory/route.ts                    # POST — pass opt-in mergeDuplicates flag through (IR3)
├── src/
│   ├── server/
│   │   ├── controllers/
│   │   │   ├── recommendations.ts            # getRecommendations(userId, ingredientItemIds?) — subset filter (IR2)
│   │   │   └── inventory.ts                  # createInventory — EC-03 merge + indicator (IR3)
│   │   ├── lib/
│   │   │   ├── inventory-merge.ts            # NEW — findMergeTarget()/mergeInto() extracted from 007 predicates
│   │   │   ├── purchase-inventory.ts         # refactor: consume the shared matcher (no behaviour change)
│   │   │   ├── ingredient-matcher.ts         # reused (normalizeIngredientName) — read-only
│   │   │   ├── unit-normalizer.ts            # reused (canSubtract/resolveAlias/normalizeUnit) — read-only
│   │   │   └── expiration.ts                 # reused (notExpiredQuery) — read-only
│   │   └── services/
│   │       ├── recommendations-cache.ts      # UNCHANGED — per-selection key falls out of buildCacheKey
│   │       ├── meal-recommender.ts           # UNCHANGED — already prioritises expiry (FR-IR-009 emergent)
│   │       └── recipe-verifier.ts            # UNCHANGED
│   ├── services/inventory.ts                 # fetchRecommendations(ingredientItemIds?) + quick-add merge result (IR2/IR3)
│   ├── context/
│   │   ├── RecommendationsContext.tsx        # unchanged shape; results persist for the session (FR-IR-003)
│   │   ├── ToastContext.tsx                  # extend showToast with an optional { label, onAction } (IR3)
│   │   └── InventoryContext.tsx              # addItem surfaces the merge indicator / undo path (IR3)
│   ├── components/
│   │   ├── recommendations/RecommendationsPanel.tsx  # REMOVE auto-load useEffect; CTA + empty state; accept scope (IR1/IR2)
│   │   ├── calendar/SuggestionsRail.tsx      # ingredient-filter chips → scoped request (IR2)
│   │   ├── inventory/InventoryList.tsx       # Kitchen select mode (checkboxes) (IR2)
│   │   ├── inventory/QuickAdd.tsx            # merge Undo trigger wiring (IR3)
│   │   └── shared/Toast.tsx                  # render the optional Undo action (IR3)
│   └── views/InventoryPage.tsx               # select-mode state + "Find recipes with selected" bar; Undo toast (IR2/IR3)
└── tests/
    ├── server/recommendations.test.ts        # extended — subset filter, per-selection cache, fallback (IR2)
    ├── server/inventory.test.ts              # extended — EC-03 merge/indicator + non-merge cases (IR3)
    ├── server/unit/inventory-merge.test.ts   # NEW — the extracted matcher (IR3)
    └── components/… + context/…              # RTL — no-auto-load, CTA, selection surfaces, Undo (IR1–IR3)
```

**Structure Decision**: everything lands in the existing single `packages/client` app. The scope is a subset filter inside `getRecommendations` — no new endpoint, no new pipeline. The merge matcher is extracted into a pure server lib (`inventory-merge.ts`) so it is unit-tested without HTTP and shared verbatim by the spec-007 grocery purchase path and the new EC-03 quick-add path (DRY, constitution "no duplicate logic"). No new document type and no new React context: results already persist in `RecommendationsProvider`, and the selection is transient per-surface state.

## Phase breakdown (each phase ends runnable + tests green; phases = spec stories)

1. **IR1 — Recommendations only when I ask (US1/P1, MVP).** Remove the auto-load: delete the prefetch `useEffect` in `RecommendationsPanel.tsx:38-43` (fires when inventory first becomes non-empty) so no agent call is made on load (FR-IR-001); render a calm empty state with the existing "Get Recommendations" button as the sole trigger (FR-IR-002). Session persistence is preserved for free — `RecommendationsProvider` sits at app level (`app/providers.tsx:23`) so `meals`/`cachedAt` survive route navigation, and `handleFetch` already short-circuits when `meals.length > 0` within the client TTL (FR-IR-003). Whole-inventory behaviour on the explicit tap is byte-identical to today, including EC-01 and FR-037 (FR-IR-004). Independent test (RTL): mount fresh → assert **no** `fetchRecommendations` call and the CTA is shown; click CTA → one call; re-mount with results in context → no new call.
2. **IR2 — Cook from what I pick (US2/P2).** Add optional `ingredientItemIds?: string[]` to the `POST /recommendations` body (Zod: array of ObjectId-shaped strings, capped); the route parses it and calls `getRecommendations(userId, ids)`. In the controller, after loading `activeItems = InventoryItem.find({ userId, ...notExpiredQuery() })`, intersect by `_id`: a non-empty intersection scopes `activeItems` to the selection; an empty or all-expired intersection falls through to the whole set (FR-IR-010). The rest — `ingredients` map, `buildCacheKey`, `getMealRecommendations`, `groundMeals(userId, meals, scopedItems)`, `setCached` — runs unchanged over the subset, so grounding (spec 006), the ingredient-keyed cache (per-selection, FR-IR-011), expiry prioritisation within the selection (FR-IR-009, emergent — the agent already prioritises soonest), FR-037, and the rate limit all apply as-is. Client: `fetchRecommendations(ingredientItemIds?)` omits the field when no selection (whole inventory) and sends it when active (FR-IR-007). Two converging entry points: Kitchen select mode (`InventoryList` checkboxes + a "Find recipes with selected" bar in `InventoryPage`, results into `RecommendationsPanel`) and suggestions-rail ingredient-filter chips (`SuggestionsRail`) — both build the same id set and call the one service path (FR-IR-006). Independent test: scoped request returns meals grounded only on the selected items (server handler test asserts the agent receives only the subset and grounding resolves only those); same selection twice → cache hit (SC-IR-005); both surfaces produce identical output for the same selection (SC-IR-004).
3. **IR3 — Quick-add stops stacking duplicates (US3/EC-03/P3).** Extract `findMergeTarget(userId, name, unit)` + `mergeInto(target, quantity, unit)` into `src/server/lib/inventory-merge.ts` from `purchase-inventory.ts`'s existing `sameIngredient`/`canMergeUnits`/`convertQuantity`/`sameNameCandidates` predicates (reuse, not reinvent); refactor `applyPurchase` to consume it (no behaviour change, keeps the suite green). `createInventory` gains an opt-in `mergeDuplicates` flag (set only by the quick-add path, so deliberate creates elsewhere are unaffected): when set and a same-name, non-expired, compatible-unit item exists, increment its quantity and return a **merge indicator** `{ merged: true, mergedItemId, addedQuantity }`; expired or unit-incompatible same-name items are never targets → create a new row, no indicator (FR-IR-012, consistent with spec 007 FR-GC-005). Client: the quick-add add path reads the indicator and shows an Undo toast via an action-capable `ToastContext`; Undo is a transient client-held snapshot that subtracts the merged `addedQuantity` from the current quantity (clamp ≥0, mirroring `reversePurchase`), never persisting a receipt (FR-IR-013; resolves the "Undo after further edits" edge — subtract-delta-clamp never goes negative or phantom). Independent test: existing "Milk" + quick-add "milk" → no duplicate row, quantity merged, indicator returned, Undo toast; Undo restores baseline; expired/incompatible "Milk" → separate row, no merge (SC-IR-006).
4. **IR4 — Verify + cascade + handoff.** Full lint/test/build/e2e gates; spec 001 cascade on `main` (FR-012 annotated user-triggered/no auto-load; FR-012/FR-014 recommendation area noted as supporting an optional grounded ingredient subset; EC-03 acceptance scenario changed from the classic Merge/Add-separately/Cancel prompt to auto-merge + Undo — FR-IR-014); `CLAUDE.md` §4 recommendations + quick-add notes updated; `tasks.md` closed only after tests pass. Leave release/tag/Portainer items unchecked for the Claude/human release flow.

## Complexity Tracking

*No constitution violations to justify.* Key judgments: **(a)** scoping is a **subset filter** over the `activeItems` the controller already loads — the cache key (`buildCacheKey`, keyed on the ingredient tuples) then differs per selection with **zero** cache-module change, so per-selection caching (FR-IR-011) is emergent; **(b)** grounding is already parameterised on the inventory array passed to `groundMeals`, so passing the subset scopes validation to exactly the selected items with no grounding change; **(c)** expiry prioritisation within a selection (FR-IR-009) is emergent — the agent prompt already says "prioritise ingredients expiring soonest," and it only ever sees the items we send; **(d)** the two entry points converge at the **service/endpoint**, not a shared selection atom, so no new context is needed and the selection stays transient per the Key Entities; **(e)** the EC-03 merge reuses the spec-007 predicates rather than a second matching implementation, and Undo mirrors `reversePurchase` (subtract-delta) rather than a new persisted receipt.

## Risks & mitigations

- **Two recommendation surfaces, one "meal-plan screen" in the prose** → the auto-load the spec targets actually lives on the **Kitchen/home** `RecommendationsPanel` (`InventoryPage`, the login landing `/`), while the calendar `SuggestionsRail` is already manual-trigger (a "Get suggestions" button, no auto-fetch). IR1 removes the `RecommendationsPanel` prefetch `useEffect`; `SuggestionsRail` needs only the chip entry point and copy. The spec's "no auto-load applies to the meal-plan recommendation area specifically; other screens unchanged" (Assumptions) is honoured by treating the home recommendations panel as *the* recommendation area — this seam is called out for the tasks phase to lock which surface each FR-IR-001/002 test targets.
- **Empty/only-expired selection must not spend a wasted scoped call** → the server intersects the provided ids with live non-expired inventory and, on an empty intersection, falls back to the whole-inventory path (FR-IR-010) rather than sending the agent an empty ingredient list; a handler test seeds a selection of only-expired ids and asserts the whole-inventory result.
- **Merge applied too broadly** → `mergeDuplicates` is opt-in per request and set only by the quick-add path, so `POST /inventory` from deliberate-create callers keeps today's "always create" semantics; a test asserts a non-flagged create never merges.
- **Undo after an intervening edit** → Undo subtracts the recorded `addedQuantity` from the item's *current* quantity and clamps at zero (deletes if it created the row and the delta is the whole quantity), mirroring `reversePurchase`; it never resets to a stale absolute baseline, so an edit between merge and Undo is preserved minus the merge and never goes negative (spec EC "Undo after further edits").
- **Selected item deleted/edited before the request completes** → the server re-validates the id set against live inventory at request time (the same `notExpiredQuery()` load) and silently drops anything gone; grounding then only resolves survivors (spec EC, FR-IR-008) — no error surfaced.
- **`ToastContext` is message-only today** → extending it with an optional action is a minimal, backward-compatible change (existing `showToast(message)` calls keep working); the Undo control is focusable and keyboard-operable (WCAG).

## Out of scope

Free-text / un-grounded ingredient entry (explicitly deferred to a later spec — every request stays inventory-grounded, FR-IR-005); persisted "favourite ingredient sets" (selection is transient); a persisted server-side merge receipt (Undo is transient client-side); changing the agent, grounding, cache mechanism, FR-037 flow, rate-limit tiers, or EC-01/EC-08 fallbacks; `impl/vite` implementation; release tags and Portainer deployment.
