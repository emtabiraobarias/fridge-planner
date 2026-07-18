# Tasks: Inventory-Grounded Meal Consumption (`impl/nextjs`)

**Input**: Design documents from `/specs/006-meal-consumption/` (plan.md, spec.md, research.md, data-model.md, contracts/meal-consumption-api.md, quickstart.md)
**Tests**: INCLUDED — TDD is mandatory (constitution / CLAUDE.md §8); every story phase starts with failing tests citing FR-MC numbers.
**Organization**: Phases map 1:1 to spec user stories (US1–US4 = plan phases MC1–MC4) + polish (MC5). All paths relative to repo root.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4, mapping to spec.md user stories

## Phase 1: Setup

**Purpose**: Green baseline before the consumption semantics flip — no scaffolding needed (existing app, zero new dependencies).

- [x] T001 Run `npm run lint && npm test` at repo root and record the green baseline. Note: existing `packages/client/tests/server/meal-plans.test.ts` asserts the OLD planning-time consume/restore behaviour (FR-005 pre-revision) — those assertions are *expected* to be rewritten in US2 (spec change, not regression); list them in the task log so the US2 rewrite is deliberate.

---

## Phase 2: Foundational

*No foundational phase — stories introduce their own shared pieces in priority order: US1 owns the `GroundedIngredient` types (also consumed by US2's review), US2 owns the entry-lifecycle model (also consumed by US3/US4). US1 is the de-facto foundation.*

---

## Phase 3: User Story 1 — Meal suggestions grounded in what I actually have (Priority: P1) 🎯 MVP

**Goal**: Agent returns `{inventoryItemId, name, quantityToConsume, unit}` per from-inventory ingredient; server validates the untrusted payload against live inventory with tiered resolution (direct → fuzzy → learned alias) and clamping (FR-MC-001..005).

**Independent Test**: seed inventory, request recommendations (mocked agent in tests / rebuilt sidecar live), verify every grounded ingredient references a real owned item with a plausible clamped amount; hostile IDs never survive (quickstart step 1).

### Tests for User Story 1 (write first, must FAIL)

- [x] T002 [P] [US1] Failing unit tests in `packages/client/tests/server/unit/ingredient-grounding.test.ts` (node env, `mongodb-memory-server`): T1 direct `_id` hit; foreign-user `_id` rejected then re-resolved by name (FR-036/FR-MC-002); nonexistent `_id` → tier 2; fuzzy "chicken breast"→owned "Chicken" (FR-MC-003); alias-pairing hit via `inventoryName`; alias miss + mocked LLM confirm → pairing persisted + reused without re-call (FR-MC-004); LLM disabled/error → fail-open unresolved; unresolved → name joins `missingIngredients`, meal never dropped; amount > owned clamped; zero/negative/absurd amounts dropped (FR-MC-002); incompatible unit → item matched, amount unusable; malformed/oversized payload rejected by zod field-wise
- [x] T003 [P] [US1] Failing handler tests added to `packages/client/tests/server/recommendations.test.ts`: mocked agent returns grounded payload → response meals carry validated `groundedIngredients` + derived legacy `usesIngredients`; agent payload with a foreign-user ID is scrubbed end-to-end; popular-recipes fallback (EC-01) passes through ungrounded; cache serves grounded meals (grounding ran before the cache write, research D4)

### Implementation for User Story 1

- [x] T004 [P] [US1] Add `GroundedIngredient` (per data-model.md) to `packages/client/src/server/types/meal-recommendation.ts` and mirror `groundedIngredients?: GroundedIngredient[]` in `packages/client/src/types/meal-recommendation.ts`
- [x] T005 [P] [US1] Extend `packages/client/src/server/models/ingredient-alias.ts` with optional `inventoryName: string` (learned pairing, data-model.md); schema-only change (remember the dev-server-restart gotcha for hot-reloaded models)
- [x] T006 [US1] Create `packages/client/src/server/services/alias-pairing.ts`: `lookupPairing(userId, ingredientName, inventoryNames[])` — check `ingredient_aliases.inventoryName` first; on miss one `gpt-4o-mini` structured-output fetch (zod-gated to the provided inventory names or `null`), 1h in-memory TTL cache keyed `(userId, normalizedName)`, persist confirmed pairing to the alias doc; no `OPENAI_API_KEY`/error/timeout → `null` (fail-open, FR-MC-004; mirror `services/parse-assist.ts`)
- [x] T007 [US1] Create `packages/client/src/server/lib/ingredient-grounding.ts`: zod schema for the untrusted agent payload; `groundMeals(userId, meals, inventory)` resolving each ingredient through tiers T1/T2/T3 (research D2), clamping via `normalizeUnit`/`canSubtract`, deriving legacy `usesIngredients`, moving unresolved names to `missingIngredients`; export `groundedConsumptionDefaults()` for the US2 review pre-fill
- [x] T008 [US1] Wire grounding into `packages/client/src/server/controllers/recommendations.ts` (post-agent, pre-cache; fallback/stale-cache paths pass through) and relax the agent-JSON parsing in `packages/client/src/server/services/meal-recommender.ts` to accept both the legacy string-array and new object-array `usesIngredients` shapes
- [x] T009 [P] [US1] Revise `agents/meal-recommender/instructions/system-prompt.md` response format (grounded `usesIngredients` objects; IDs copied verbatim from the provided inventory JSON; never exceed owned quantity; never invent items) and update the `agents/meal-recommender/agent.yaml` test case to expect grounded output
- [x] T010 [US1] Surface grounded amounts in the suggestion UI: uses-list shows "500 g of your Chicken Thighs" where grounded in `packages/client/src/components/recommendations/MealCard.tsx` + `packages/client/src/components/calendar/SuggestionsRail.tsx` (fall back to plain names); update affected tests in `packages/client/tests/components/`

**Checkpoint**: US1 shippable alone — truthful uses/missing display, hostile-input corpus green, zero extra LLM round-trips.

---

## Phase 4: User Story 2 — Inventory changes when I cook, not when I plan (Priority: P2)

**Goal**: Entry lifecycle `planned|cooked`; planning ops lose all inventory side-effects; atomic idempotent cook via `PATCH …/entries/:slotId` applying user-confirmed review amounts (FR-MC-006..011, first half of FR-MC-012).

**Independent Test**: add a meal → inventory untouched; mark cooked with an adjusted amount → exact deduction once, even when the PATCH fires twice (quickstart steps 2–4).

### Tests for User Story 2 (write first, must FAIL)

- [x] T011 [US2] Rewrite `packages/client/tests/server/meal-plans.test.ts` against the new contract (supersedes the T001-flagged assertions, citing FR-MC numbers): POST adds `status:'planned'`, no consumption (FR-MC-006); DELETE removes without restore; PUT replace/drag-move preserves stored `status`/`cookedAt`/`consumedItems` by `slotId` and ignores client-sent lifecycle fields; PUT that drops a cooked entry leaves inventory unchanged (consumption stands, mirrors FR-MC-014); PATCH cook deducts confirmed amounts (incl. a zeroed line and a clamped over-ask, FR-MC-009), sets `cookedAt`, returns the receipt; double PATCH → one deduction + 409 `already cooked` (SC-MC-003); PATCH on unknown slot → 404; legacy no-`status` entry reads as cooked and cook → 409 (FR-MC-011); recs cache invalidated on cook (FR-MC-010, spy on `invalidateUser`)
- [x] T012 [P] [US2] Failing unit tests in `packages/client/tests/server/unit/ingredient-consumption.test.ts` for `consumeConfirmed`: deduct by `inventoryItemId`; legacy name-match fallback for ungrounded lines; clamp to live quantity; `quantity: 0` line → recorded, nothing deducted; deduction to zero deletes the item and captures `depletedSnapshot` (without `expirationStatus`); unmatched line → recorded as not consumed, nothing deducted (FR-MC-009/012)
- [x] T013 [P] [US2] Failing component tests in `packages/client/tests/components/consumption-review-sheet.test.tsx`: one row per resolved ingredient with pre-filled amount; **pre-fill clamped to current owned stock from `InventoryContext` when inventory drifted since suggestion (spec US2 scenario 5)**; stepper + numeric input adjust; zero allowed; unresolved ingredients read-only ("not from your kitchen"); confirm submits the adjusted lines; accessible (labelled inputs, ≥44px targets)

### Implementation for User Story 2

- [x] T014 [US2] Extend the entry subdocument in `packages/client/src/server/models/meal-plan.ts` (`status` enum, `cookedAt`, `consumedItems` receipt subdoc per data-model.md, `_id:false`) + types in `packages/client/src/server/types/meal-plan.ts` (incl. the `entryStatus(e)` effective-status helper) and the client mirror `packages/client/src/types/meal-plan.ts`
- [x] T015 [US2] Rewrite `packages/client/src/server/lib/ingredient-consumption.ts`: `consumeConfirmed(userId, lines) → ConsumptionReceiptLine[]` (research D7); delete `consumeIngredients`/`restoreIngredients` and their exports
- [x] T016 [US2] Update `packages/client/src/server/controllers/meal-plans.ts`: strip consumption from `addMealEntry` (write `status:'planned'`), `deleteMealEntry`, `replaceMealEntries` (+ lifecycle-preserving merge by `slotId`); add `cookMealEntry(userId, weekStart, slotId, consumption)` — conditional `findOneAndUpdate` with `arrayFilters` guard (research D6), `consumeConfirmed`, receipt write-back, `invalidateUser(userId)`
- [x] T017 [US2] Add `PATCH` to `packages/client/app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route.ts`: `withRoute` + `authenticate` + `rateLimit` + zod discriminated union (`cook` dispatches now; `uncook` returns 409 `not supported yet` until US3 — noted in the route comment)
- [x] T018 [US2] Client plumbing: `cookEntry(weekStart, slotId, consumption)` in `packages/client/src/services/meal-plans.ts`; `cook` action + entry-state patch from the response in `packages/client/src/context/MealPlanContext.tsx`; context tests in `packages/client/tests/context/`
- [x] T019 [US2] UI: new `packages/client/src/components/calendar/ConsumptionReviewSheet.tsx` (pre-fill from `groundedIngredients` via the grounding defaults, clamped to live `InventoryContext` stock, adjustable per T013 spec); "Mark cooked" flow in `packages/client/src/components/calendar/MealDetailModal.tsx`; cooked badge (icon + label, not color-alone) in `packages/client/src/components/calendar/PlannedMealTile.tsx`; view tests updated in `packages/client/tests/views/`

**Checkpoint**: planning is side-effect-free; cook deducts exactly once with user-confirmed amounts; grocery double-count gone by construction.

**US2 handover note (2026-07-18)**: T011-T019 are complete and verified. Commands run:
`npm run lint`; focused `npx vitest run --coverage=false tests/server/meal-plans.test.ts tests/server/unit/ingredient-consumption.test.ts tests/components/consumption-review-sheet.test.tsx tests/context/MealPlanContext.test.tsx tests/views/CalendarPage.test.tsx`; full `npm test` (53 files, 500 tests, coverage 92.55%); `npm -w packages/client run build`. Local test server was started from this worktree at `http://localhost:3001` with `AUTH_MODE=dev` and existing MongoDB on `localhost:27017`. Leave US3 unchecked: `uncook` intentionally returns 409 until T020-T023 add/test reversal UI + controller dispatch.

---

## Phase 5: User Story 3 — Undo that actually undoes (Priority: P3)

**Goal**: Receipts drive exact reversal — un-cook restores amounts and resurrects depleted items; deleting a cooked entry keeps the consumption; the modal shows what was consumed (FR-MC-012..015).

**Independent Test**: cook a meal that partially consumes one item and fully depletes another; un-cook; inventory exactly as before including the resurrected item (quickstart step 5).

### Tests for User Story 3 (write first, must FAIL)

- [x] T020 [US3] Failing tests: in `packages/client/tests/server/unit/ingredient-consumption.test.ts` — `restoreFromReceipt` increments existing items, re-creates depleted items from snapshots via `.save()` (assert `expirationStatus` recomputed by the hook, never copied); in `packages/client/tests/server/meal-plans.test.ts` — PATCH un-cook returns entry to `planned` + clears receipt/cookedAt; cook→un-cook leaves inventory byte-equal incl. a depletion case (SC-MC-004); double un-cook → one restore + 409 `not cooked`; legacy cooked (no receipt) un-cook → 409 `cannot un-cook a pre-existing entry` (FR-MC-011); DELETE of a cooked entry leaves inventory unchanged (FR-MC-014); recs cache invalidated on un-cook (FR-MC-010)

### Implementation for User Story 3

- [x] T021 [US3] Add `restoreFromReceipt(userId, lines)` to `packages/client/src/server/lib/ingredient-consumption.ts` (research D7 — increment or re-create from `depletedSnapshot` via `new InventoryItem(...).save()`)
- [x] T022 [US3] Add `uncookMealEntry` to `packages/client/src/server/controllers/meal-plans.ts` (guard `status:'cooked'` ∧ `consumedItems` exists via `arrayFilters`; restore; clear `cookedAt`/`consumedItems`; `invalidateUser`); complete the `uncook` dispatch in `packages/client/app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route.ts`
- [x] T023 [US3] UI + client: `uncookEntry` in `packages/client/src/services/meal-plans.ts` + context action; cooked-entry view in `packages/client/src/components/calendar/MealDetailModal.tsx` shows `cookedAt` + consumed list (FR-MC-015) + "Un-cook" (hidden for legacy receipt-less entries); component/context tests updated

**Checkpoint**: mis-taps are a two-tap recovery; receipts round-trip exactly.

---

## Phase 6: User Story 4 — A grocery list that counts real amounts (Priority: P4)

**Goal**: Generator sums grounded quantities per canonical ingredient across **planned** entries, nets owned non-expired stock via `netNeeded`, lists real-amount shortfalls, omits covered lines; servings fallback per line (FR-MC-016..019).

**Independent Test**: two planned meals needing 200 g + 300 g mince with 400 g owned → "Mince — 100 g"; a meal with unusable amounts falls back to "×N" (quickstart step 6).

### Tests for User Story 4 (write first, must FAIL)

- [x] T024 [US4] Failing tests in `packages/client/tests/server/unit/grocery-list-generator.test.ts` mapping the spec US4 scenarios: 200 g + 300 g vs 400 g owned → 100 g line (FR-MC-016); fully covered → omitted; expired owned stock not netted (FR-MC-018, feed already `notExpiredQuery`-filtered — assert an expired item doesn't reduce need); mixed grounded/ungrounded week → real amounts + servings coexist (FR-MC-017); same canonical name in incompatible families collapses that line to servings; cooked and legacy no-`status` entries excluded from need computation (research D9); compatible-unit summation (1 kg + 500 g → 1.5 kg); existing servings-model tests stay green (FR-MC-019 regression net)

### Implementation for User Story 4

- [x] T025 [US4] Extend `packages/client/src/server/lib/grocery-list-generator.ts`: planned-only entry filter via `entryStatus`; grounded-needs pass (sum per canonical name per unit family, `netNeeded` against matching inventory, shortfall lines with real quantity/unit); ungrounded/missing pass unchanged (servings); per-line fallback on any reconciliation failure (FR-MC-017)
- [x] T026 [US4] Verify `packages/client/src/server/controllers/grocery-lists.ts` feeds full entries (incl. `status`) to the generator; confirm `packages/client/src/views/GroceryListPage.tsx` renders quantity+unit lines correctly (it already displays `quantity`/`unit`) and update `packages/client/tests/views/` fixtures with grounded examples

**Checkpoint**: FR-027/FR-028 delivered where quantities exist; list never fails over units.

---

## Phase 7: Polish & release (MC5)

- [x] T027 Full verification: `npm run lint`, `npm test`, `npm -w packages/client run build`, `bash scripts/validate-e2e.sh --no-agent` — all green at repo root
- [x] T028 Playwright e2e in `packages/client/e2e/`: plan → inventory unchanged → cook with one adjusted amount → Kitchen reflects → un-cook restores → grocery netting visible; capture screenshots (cooked tile + review sheet) into `packages/client/e2e/screenshots/`
- [ ] T029 [P] Live agent smoke (optional, needs `OPENAI_API_KEY`): `docker compose up -d --build holodeck`, request recommendations, verify grounded output shape end-to-end; run the `agent.yaml` eval case if credentials allow
- [x] T030 [P] Per-branch doc cascade: `CLAUDE.md` §4 (PATCH endpoint row + revised behaviour notes), §5 (MealPlan entry fields incl. receipt), §9 (agent grounded-output schema note); `specs/006-meal-consumption/plan.md` tick-through
- [ ] T031 Release prep (with the user): version bump, tag `nextjs-v4.4.0` + `agent-v*` (prompt change requires the sidecar image), CI build-push, manual Portainer Pull-and-redeploy, roadmap update on `main`

---

## Dependencies

- **US1 → US2**: the review pre-fill consumes `groundedIngredients` + `groundedConsumptionDefaults()` (US2 works degraded without US1 — legacy 1-unit pre-fill — but build in order).
- **US2 → US3**: un-cook needs receipts written by cook; the PATCH route/controller are shared.
- **US2 → US4**: the planned-only filter needs `entryStatus`; netting needs grounded quantities (US1) for real-amount lines.
- **US4** depends on US1 (quantities) + US2 (status); not on US3.
- Story order **US1 → US2 → US3 → US4** is both priority and dependency order.

## Parallel opportunities

- T002 ∥ T003 (different test files); T004 ∥ T005 ∥ T009 (types / model / agent docs); T012 ∥ T013 alongside T011; T029 ∥ T030 in polish.
- Within US1: T006 and T007 touch different files but T007 imports T006 — sequence them; T009 + T010 parallel after T008.

## Implementation strategy

**MVP = US1** (truthful grounded suggestions, shippable alone). Then US2 (the semantic flip — biggest behavioural change, gated by its rewritten handler suite), US3 (safety net), US4 (payoff). Each checkpoint ends runnable with suites green; release happens once at T031 (single 4.4.0 cut with the paired agent image), not per story.
