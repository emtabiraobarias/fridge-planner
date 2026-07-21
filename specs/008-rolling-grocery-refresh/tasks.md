# Tasks: Daily Rolling Grocery-List Refresh (`impl/nextjs`)

**Input**: Design documents from `/specs/008-rolling-grocery-refresh/` (plan.md, spec.md, research.md, data-model.md, contracts/rolling-grocery-api.md, quickstart.md)
**Tests**: INCLUDED - TDD is mandatory (constitution / `CLAUDE.md` section 8); every story phase starts with failing tests citing FR-RG numbers.
**Organization**: Phases map 1:1 to spec user stories (US1-US3 = plan phases RG1-RG3) + Setup/Foundational + polish (RG4). All paths relative to repo root.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1-US3, mapping to spec.md user stories

## Phase 1: Setup

**Purpose**: Establish the implementation baseline before touching model/lib/controller code.

- [x] T001 Run `npm run lint && npm test` at repo root and record baseline notes in `specs/008-rolling-grocery-refresh/quickstart.md` verification log
- [x] T002 Review existing `packages/client/tests/server/grocery-lists.test.ts` GET/generate coverage and note which assertions assume "generate once, then return verbatim" (007 behavior) that US1/US3 must consciously change to recompute-on-view

---

## Phase 2: Foundational

**Purpose**: Day-anchor fields and the shared date-cutoff/reconcile lib that every story builds on.

- [x] T003 [P] Add `addedOn?: Date` and `purchasedOn?: Date` to `IGroceryListItem` in `packages/client/src/server/types/grocery-list.ts`
- [x] T004 [P] Mirror `addedOn?: string` and `purchasedOn?: string` (ISO) on the client `GroceryListItem` type in `packages/client/src/types/grocery-list.ts`
- [x] T005 Add `addedOn`/`purchasedOn` (`type: Date, required: false`, no default) to `groceryListItemSchema` in `packages/client/src/server/models/grocery-list.ts`
- [x] T006 [P] Add failing unit tests for `startOfTodayCutoff()` in `packages/client/tests/server/unit/rolling-grocery.test.ts` — local calendar day projected onto UTC-midnight axis, entry-in-scope boundary at exactly `cutoff` (FR-RG-010), and the 23:59/00:01 local-vs-UTC tension case using `vi.useFakeTimers()`/`vi.setSystemTime()` (research D3)
- [x] T007 Create `packages/client/src/server/lib/rolling-grocery.ts` skeleton exporting `startOfTodayCutoff(): Date` (server-clock local-day → UTC-midnight instant, per research D3) so T006 passes; leave `reconcileRollingList` as a stub signature for Phase 3

**Foundational verification**: `npx vitest run --coverage=false tests/server/unit/rolling-grocery.test.ts` passes; `npm run lint` passes; no other test file's behavior changes yet (new optional fields only).

---

## Phase 3: User Story 1 - Past meals stop generating shopping needs (Priority: P1) MVP

**Goal**: Generated needs are computed only from `planned` entries dated today-or-later; generated rows reconcile in place by `ingredientName`, preserving `_id` (FR-RG-001, FR-RG-003, FR-RG-006, FR-RG-007).

**Independent Test**: plan a planned dinner yesterday and one tomorrow needing the same ingredient; force-regenerate; only the tomorrow dinner's ingredients remain, correctly requantified and re-sourced.

### Tests for User Story 1 (write first, must FAIL)

- [x] T008 [P] [US1] Add failing unit tests in `packages/client/tests/server/unit/rolling-grocery.test.ts` for `reconcileRollingList()`: surviving generated row keeps `_id` and is requantified (FR-RG-007), zeroed/fully-past generated row is dropped (FR-RG-006), a mixed-source line (one meal yesterday, one tomorrow) shrinks to only the tomorrow shortfall and source list (FR-RG-003, scenario 2), new in-scope need is inserted
- [x] T009 [P] [US1] Add failing unit tests in `packages/client/tests/server/unit/grocery-list-generator.test.ts` (or extend existing coverage) for `generateGroceryList(mealPlan, inventory, asOf)`: a planned entry dated before `asOf` contributes zero items/quantity regardless of cooked state, a cooked entry dated yesterday contributes nothing, servings-fallback count sums only in-scope meals (FR-RG-001/003); stock added by a prior-day (since-shed) purchase nets off the recomputed need so nothing is re-listed (FR-RG-011) [analyze C3]
- [x] T010 [US1] Add failing handler tests in `packages/client/tests/server/grocery-lists.test.ts` for `POST /:weekStart/generate`: a yesterday-dated planned dinner and a tomorrow-dated one produce a list containing only tomorrow's ingredients; a generated-only line with all-past sources disappears on regenerate (FR-RG-001/006/007)

### Implementation for User Story 1

- [x] T011 [US1] Update `generateGroceryList` in `packages/client/src/server/lib/grocery-list-generator.ts` to accept an `asOf: Date` parameter and filter `planned` entries to `entry.date.getTime() >= asOf.getTime()` before the existing netting/servings-fallback logic runs (FR-RG-001/003)
- [x] T012 [US1] Implement `reconcileRollingList(existing, freshGenerated, asOf)` in `packages/client/src/server/lib/rolling-grocery.ts`: partition stored items into replaceable-generated vs sticky (research D4), diff replaceable rows against `freshGenerated` by `ingredientName` — keep `_id` + overwrite `quantity`/`unit`/`sourceMealNames` on match (FR-RG-007), drop on zero/absent (FR-RG-006), insert new needs; sticky rows pass through unchanged for now (shed logic lands in Phase 4)
- [x] T013 [US1] Update `regenerateGroceryList` in `packages/client/src/server/controllers/grocery-lists.ts` to compute `asOf = startOfTodayCutoff()`, call `generateGroceryList(mealPlan, inventory, asOf)`, and merge via `reconcileRollingList` instead of the current "generated + manual passthrough" concat

**Checkpoint**: force-regenerate is date-scoped and id-stable; `getGroceryList` (GET) still uses the old 007 path until Phase 5.

**US1 verification**: failing tests observed before implementation (no `asOf` param; no `reconcileRollingList`; regenerate counted all-week entries). After implementation, focused `npx vitest run --coverage=false tests/server/unit/rolling-grocery.test.ts tests/server/unit/grocery-list-generator.test.ts tests/server/grocery-lists.test.ts` passes; `npm run lint` passes.

---

## Phase 4: User Story 2 - Same-day purchase integrity, daily shed (Priority: P2)

**Goal**: Manual and purchased rows are day-anchored, survive every same-day refresh (receipt intact), and are pruned at the next rollover with inventory untouched; legacy anchor-less sticky rows are lazily backfilled (FR-RG-004, FR-RG-005, FR-RG-011).

**Independent Test**: tick a generated line and add a manual item; regenerate repeatedly the same day (both rows intact, un-tick reverses exactly); advance the clock past midnight, regenerate again — both rows gone, inventory unchanged, need not re-listed.

### Tests for User Story 2 (write first, must FAIL)

- [x] T014 [P] [US2] Extend failing unit tests in `packages/client/tests/server/unit/rolling-grocery.test.ts` for `reconcileRollingList` sticky handling: manual row with `addedOn` today survives verbatim, manual row with `addedOn` before today is shed; purchased row with `purchasedOn` today survives with receipt intact even when its source meal's date has passed, purchased row with `purchasedOn` before today is shed (receipt dropped, no inventory mutation implied); a sticky row with no anchor at all is lazily stamped to `asOf` and survives that call (FR-RG-004/005, research D5)
- [x] T015 [US2] Extend failing handler tests in `packages/client/tests/server/grocery-lists.test.ts` for `PATCH .../items/:itemId`: a tick stamps `purchasedOn` on the returned row; regenerating the same day after a tick leaves the row purchased with its receipt (FR-RG-005); a recompute fired between a tick and its un-tick does not detach the receipt (FR-RG-011, the mid-shop race from spec.md Edge Cases); un-ticking a row whose anchor day has already shed returns 404 (research D7) instead of the 007 409; and `POST .../complete` stamps `purchasedOn` on every row it marks purchased (contract: checkout rows follow the same daily shed) [analyze C1]
- [x] T016 [US2] Extend failing handler tests in `packages/client/tests/server/grocery-lists.test.ts` for `addGroceryItem`: a manually added item carries `addedOn` set to today, and a regenerate the same day leaves it unchanged (FR-RG-004)
- [x] T017 [P] [US2] Add a failing concurrency-shaped test in `packages/client/tests/server/grocery-lists.test.ts`: GET the list (recompute), then immediately PATCH-tick a row returned by that GET by its `_id` — the tick must succeed against the just-recomputed row (id-stability guard for the "GET now mutates" tension, research risk 2 / FR-RG-011)

### Implementation for User Story 2

- [x] T018 [US2] Update `addGroceryItem` in `packages/client/src/server/controllers/grocery-lists.ts` to stamp `addedOn: new Date()` on the new manual item (FR-RG-004)
- [x] T019 [US2] Update `purchaseGroceryItem` **and** the checkout path (`completeGroceryList`) in `packages/client/src/server/controllers/grocery-lists.ts` to stamp `purchasedOn: new Date()` in the same write that flips `isPurchased: true` (FR-RG-005; contract "008 note" on `POST .../complete`) [analyze C1]
- [x] T020 [US2] Extend `reconcileRollingList` in `packages/client/src/server/lib/rolling-grocery.ts` to classify sticky rows by `purchasedOn ?? addedOn` (research D4/D5): preserve verbatim when anchor day `>= asOf`, prune (drop row + receipt) when anchor day `< asOf`, and lazily backfill `addedOn`/`purchasedOn` to `asOf` when both are absent on an existing sticky row (legacy back-compat, data-model.md "Back-compat for legacy rows")
- [x] T021 [US2] Update `unpurchaseGroceryItem` in `packages/client/src/server/controllers/grocery-lists.ts` so the existing 404 (item not found — already covers a shed row once `reconcileRollingList` runs at GET/generate time) and 409 (receipt-less/wrong-state) paths remain distinct; no new status code — confirm/adjust the `findOne` guard order so a shed row (absent from the document) naturally 404s before the 409 receipt check; a successful un-tick clears `purchasedOn` alongside the receipt (data-model un-tick transition) [analyze I1]

**Checkpoint**: same-day mid-shop flows are safe under repeated regenerate; shed is a pure prune with no inventory side effect.

**US2 verification**: failing tests observed before implementation (no anchor stamps written; sticky rows had no shed rule; un-tick-after-shed returned whatever the pre-008 404/409 ordering happened to produce, unverified). After implementation, focused `npx vitest run --coverage=false tests/server/unit/rolling-grocery.test.ts tests/server/grocery-lists.test.ts` passes; `npm run lint` passes.

---

## Phase 5: User Story 3 - The list is current without manual regeneration (Priority: P3)

**Goal**: `GET` recomputes on every view (not just when the document is absent), so manual and automatic refresh converge and the list is current with zero user action (FR-RG-002, FR-RG-008, FR-RG-009).

**Independent Test**: a list last computed yesterday; open the grocery page today with no explicit action — needs already reflect today's scope; force-regenerate afterward produces an identical list.

### Tests for User Story 3 (write first, must FAIL)

- [x] T022 [P] [US3] Add failing handler tests in `packages/client/tests/server/grocery-lists.test.ts` for `GET /:weekStart`: a stored document from "yesterday" (generated needs include a since-passed meal) is recomputed on GET to reflect today's scope with no explicit regenerate call (FR-RG-002 scenario 1); GET and a subsequent force-`generate` on the same instant return byte-identical `items` (FR-RG-002 scenario 2); a future week's GET counts all its planned meals (FR-RG-002 scenario 3); a week whose days have all passed recomputes to empty generated needs — no browsable history (FR-RG-009) [analyze C2]
- [x] T023 [US3] Add a failing handler test in `packages/client/tests/server/grocery-lists.test.ts` for `GET /:weekStart` when no meal plan and no stored list exist for the week — still returns `{ groceryList: null }` (contract: unchanged null path)
- [x] T024 [P] [US3] Add failing context tests in `packages/client/tests/context/GroceryListContext.test.tsx` (or extend existing) confirming `refresh()`/initial fetch surfaces the server-recomputed list with no client-side date logic added (FR-RG-002; context stays server-trusting)

### Implementation for User Story 3

- [x] T025 [US3] Update `getGroceryList` in `packages/client/src/server/controllers/grocery-lists.ts` to run the same `asOf = startOfTodayCutoff()` → `generateGroceryList(mealPlan, inventory, asOf)` → `reconcileRollingList(existing, ..., asOf)` path unconditionally (not only when `existing` is absent), and persist the reconciled result via `findOneAndUpdate` (extends the existing lazy upsert) before returning it
- [x] T026 [US3] Handle the "no meal plan and no stored list" case in `getGroceryList` explicitly so it still short-circuits to `{ groceryList: null }` without calling the reconcile path (avoid recomputing against an absent plan)
- [x] T027 [US3] Review `packages/client/src/views/GroceryListPage.tsx` and `packages/client/src/context/GroceryListContext.tsx` for any copy or logic that assumed "generate is a distinct action from view" and update wording only if it now misleads (no new interactive surface per plan.md Constitution Check)

**Checkpoint**: the rolling list is live on every view; US1+US2+US3 together deliver the full spec.

**US3 verification**: failing tests observed before implementation (GET returned the stale stored document verbatim once one existed). After implementation, focused `npx vitest run --coverage=false tests/server/grocery-lists.test.ts tests/context/GroceryListContext.test.tsx` passes; `npm run lint` passes; full `npm test` passes.

---

## Phase 6: Polish & handoff (RG4)

**Purpose**: Lock down the three known tensions with explicit tests, cascade docs, and hand off release steps.

- [x] T028 [P] Add an explicit timezone-boundary test in `packages/client/tests/server/unit/rolling-grocery.test.ts`: using `vi.setSystemTime()`, set the host clock to 23:59 local time and to 00:01 local time on either side of a local-day rollover, in a non-UTC timezone (research D3 tension), and assert a today-dated (UTC-midnight-authored) meal-plan entry's in/out-of-scope result is correct at both instants — the local-vs-UTC midnight seam plan.md flags as the one tension the tasks phase must lock down
- [x] T029 [P] Add an explicit GET-recompute-then-tick concurrency test in `packages/client/tests/server/grocery-lists.test.ts` if not already covered by T017: GET the list (triggers a persisted recompute), then PATCH-tick a row by the `_id` returned from that GET, asserting 200 not 404 — proves generated-row id-stability survives the "GET now mutates" behavior (research risk 2)
- [x] T030 [P] Add a client-side test (context or view, e.g. `packages/client/tests/context/GroceryListContext.test.tsx` or `packages/client/tests/pages/GroceryListPage.test.tsx`) asserting both a 404 (shed row) and a 409 (same-day wrong-state) response from un-tick are handled identically — refetch, "cannot reverse," no distinct UI branch (contract D7 / FR-RG-005 client-side tension)
- [x] T031 Update `packages/client/e2e/grocery-checkoff.e2e.ts` (or add a new `packages/client/e2e/rolling-grocery.e2e.ts`) only if the existing e2e asserts list contents that a rolling regenerate would now change; otherwise confirm it stays green as-is and note that in the verification log
- [x] T032 Full verification: run `npm run lint`, `npm test`, `npm -w packages/client run build`, `npm -w packages/client run test:e2e`, `bash scripts/validate-e2e.sh --no-agent`, and record results in `specs/008-rolling-grocery-refresh/quickstart.md` verification log
- [x] T033 [P] Doc cascade in `CLAUDE.md`: update section 4 Grocery Lists GET/generate rows (recompute-on-view, day-anchor stamps) and section 5 GroceryList model (`addedOn`/`purchasedOn` on the item subdocument) per FR-RG-012
- [x] T034 [P] Update `docs/smoke-test.md` only if its checkout/grocery narrative (around the existing "grocery list lazily generated" step) needs a note that GET is now always-recompute rather than generate-once; otherwise confirm no change needed
- [x] T035 Verify the spec `001` cascade (FR-025 restated as date-scoped rolling generation, FR-026 aggregation noted as in-scope-meal-set, FR-030/FR-031 annotated with day-scoped persistence / same-day reversal window per FR-RG-012) is present on `main` per plan.md's note that it was "already revised on `main`" — confirm no further drift in `specs/001-meal-planner/spec.md`, do not re-edit it from this branch
- [x] T036 Review and tick completed tasks in `specs/008-rolling-grocery-refresh/tasks.md` only after the corresponding targeted tests pass
- [x] T037 Release handoff only: leave version tags, image pushes, Portainer redeploy notes, and the spec-001-cascade-merged checkbox unchecked in `specs/008-rolling-grocery-refresh/quickstart.md` (left unchecked as required)

**RG4 verification**: full gate green; doc cascade complete; release-handoff items intentionally left unchecked for the human/release flow.

---

## Dependencies

- **Foundational -> US1**: `addedOn`/`purchasedOn` fields and `startOfTodayCutoff()` must exist before `generateGroceryList`/`reconcileRollingList` can be date-scoped.
- **US1 -> US2**: sticky-row shed logic extends the same `reconcileRollingList` diff US1 builds for generated rows.
- **US2 -> US3**: `getGroceryList` reuses the full (generated + sticky) reconcile path US1+US2 complete; wiring it into GET before the shed rule exists would silently drop same-day purchases.
- **US1/US2/US3 -> Polish**: boundary/concurrency/client tests in Phase 6 exercise the finished reconcile+GET path.
- Story order: **US1 -> US2 -> US3**.

## Parallel opportunities

- T003, T004, and T006 can run in parallel after nothing (Foundational start).
- T008 and T009 are independent failing-test tasks for US1 (lib-level vs generator-level).
- T014 and T017 cover different layers for US2 (lib unit test vs handler concurrency test) and can run in parallel with each other, but both depend on T012/T013 existing.
- T022 and T024 can run in parallel (handler vs context tests) for US3.
- T028, T029, T030 are independent boundary/concurrency/client tests and can run in parallel.
- T033 and T034 can run in parallel after implementation behavior is stable.

## Implementation strategy

**MVP = US1**: date-scoped generation with id-stable reconcile via `reconcileRollingList`, wired into the existing force-`generate` action first (lowest-risk entry point — GET's read-only contract is untouched). Then US2 makes same-day purchases/manual adds safe under repeated regenerate and defines the shed, and US3 flips `GET` itself onto the same path so the list is current with zero user action. Each checkpoint should end with targeted tests green before any checkbox is marked complete.
