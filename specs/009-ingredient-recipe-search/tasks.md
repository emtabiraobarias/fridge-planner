# Tasks: Ingredient-Driven Recipe Search + Manual-Only Recommendations (`impl/nextjs`)

**Input**: Design documents from `/specs/009-ingredient-recipe-search/` (plan.md, spec.md, research.md, data-model.md, contracts/recommendations-scoping-api.md, quickstart.md)
**Tests**: INCLUDED - TDD is mandatory (constitution / `CLAUDE.md` section 8); every story phase starts with failing tests citing FR-IR numbers.
**Organization**: Phases map 1:1 to spec user stories (US1-US3 = plan phases IR1-IR3) + Setup/Foundational + polish (IR4). All paths relative to repo root.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1-US3, mapping to spec.md user stories

## Phase 1: Setup

**Purpose**: Establish the implementation baseline and confirm the exact seam the plan/research flag before touching any code.

- [x] T001 Run `npm run lint && npm test` at repo root and record baseline notes in `specs/009-ingredient-recipe-search/quickstart.md` verification log
- [x] T002 Review `packages/client/tests/components/RecommendationsPanel.test.tsx`, `packages/client/tests/InventoryPage.test.tsx`, and `packages/client/tests/server/recommendations.test.ts` for assumptions IR1-IR3 change; specifically note that the current RTL suite mounts `RecommendationsPanel` with an **empty** `fetchInventory` mock (`{items:[]}`), so the existing prefetch `useEffect` (`RecommendationsPanel.tsx:38-43`, fires on `items.length` transitioning from empty to non-empty) never actually triggers today — no existing test asserts "no auto-load". IR1's tests (Phase 3) must seed a **non-empty** inventory mock to genuinely exercise the effect being removed.

---

## Phase 2: Foundational

**Purpose**: Shared groundwork two later stories build on — the `ToastContext` action extension (IR3's Undo prerequisite) and the `ingredientItemIds`/`mergeDuplicates` type/schema plumbing (IR2/IR3 prerequisite). No user-visible behavior change yet.

- [x] T003 [P] Add a new failing test file `packages/client/tests/context/ToastContext.test.tsx`: the existing `showToast(message)` call still shows the message and auto-dismisses after the timeout (regression); a new `showToast(message, { label, onAction })` call renders a focusable, keyboard-operable action control alongside the message, and activating it invokes `onAction` (research D7 — prerequisite for IR3's Undo)
- [x] T004 Extend `ToastContextValue`/`showToast` in `packages/client/src/context/ToastContext.tsx` to accept an optional `action?: { label: string; onAction: () => void }`, stored alongside `toast` state, so T003 passes; existing message-only call sites are unaffected
- [x] T005 [P] Render the optional action button in `packages/client/src/components/shared/Toast.tsx` (label text + `onClick` → `onAction()` then dismiss) so T003's action-control assertions pass
- [x] T006 [P] Add the optional `ingredientItemIds` field (Zod: `z.array(z.string().min(1).max(64)).max(20)`, optional; malformed/absent treated as no selection, never a 400) to the `POST /api/v1/recommendations` body parsing in `packages/client/app/api/v1/recommendations/route.ts` — parsed but **not yet** passed to the controller (behavior-neutral placeholder; wired in IR2, research D1 / contracts/recommendations-scoping-api.md)
- [x] T007 [P] Add the matching optional `ingredientItemIds?: string[]` parameter to `fetchRecommendations()` in `packages/client/src/services/inventory.ts`, included in the POST body **only** when the array is non-empty (D3) — the one service function both IR2 entry points (Kitchen select mode, suggestions-rail chips) will call; not yet passed by any caller
- [x] T008 [P] Add the optional `mergeDuplicates?: boolean` field (default false) to the create-payload type used by `createItem()` in `packages/client/src/services/inventory.ts` (typed only; server-side Zod + branch logic land in IR3, T032)

**Foundational verification**: `npx vitest run --coverage=false tests/context/ToastContext.test.tsx` passes; `npm run lint` passes; no other test file's behavior changes yet (new optional fields/params only, unwired).

---

## Phase 3: User Story 1 - Recommendations only when I ask (Priority: P1) MVP

**Goal**: The Kitchen/home `RecommendationsPanel` never auto-fetches; a "Get Recommendations" CTA is the sole trigger; already-fetched session results still display instantly; whole-inventory behaviour on the explicit tap is unchanged, including EC-01 and FR-037 (FR-IR-001, FR-IR-002, FR-IR-003, FR-IR-004).

**Independent Test**: Load the meal-plan screen fresh (no prior request this session) → no recommendation request is issued and an empty state with a CTA is shown → tap "Get Recommendations" → whole-inventory suggestions load. Revisit the screen in the same session → prior results show with no new request.

### Tests for User Story 1 (write first, must FAIL)

- [x] T009 [P] [US1] Add a failing test in `packages/client/tests/components/RecommendationsPanel.test.tsx`: render with a **non-empty** `InventoryProvider` (override the `fetchInventory` mock to resolve a populated item — see T002's finding) and assert `fetchRecommendations` is **not** called on mount, and an empty-state CTA is shown (FR-IR-001/002, SC-IR-001)
- [x] T010 [US1] Add a failing test in the same file: pre-seed `RecommendationsContext` with an already-successful result (e.g. a small test helper that drives `setMeals` via a stub `fetchRecommendations` and an initial click before the assertion, or a context wrapper that seeds `meals`/`cachedAt`) → re-mount `RecommendationsPanel` → prior results render immediately with **no** new `fetchRecommendations` call (FR-IR-003)
- [x] T011 [P] [US1] Add a regression test in `packages/client/tests/components/calendar/SuggestionsRail.test.tsx` asserting mount alone (no click) triggers **zero** `fetchRecommendations` calls — locks down that the calendar rail is already manual-trigger, so IR1's removal work below must target only `RecommendationsPanel.tsx`, not this file (plan.md Risks tension #1)

### Implementation for User Story 1

- [x] T012 [US1] Remove the prefetch `useEffect` and the now-unused `prefetchedRef` at `packages/client/src/components/recommendations/RecommendationsPanel.tsx:35-43` so mounting never auto-fetches; keep the existing "Get Recommendations" button as the sole trigger (FR-IR-001)
- [x] T013 [US1] Add a calm empty-state message in `RecommendationsPanel.tsx`'s `renderResults`/render body, shown when `state === 'idle'` and `meals.length === 0` (before the first request), without regressing the existing loading/error/success branches, so T009 passes (FR-IR-002)

**Checkpoint**: fresh visits make zero recommendation requests; the manual button and session persistence behave exactly as before; the calendar rail is untouched.

**US1 verification**: failing tests observed before implementation (the effect fired on non-empty inventory; no empty state existed). After implementation, focused `npx vitest run --coverage=false tests/components/RecommendationsPanel.test.tsx tests/components/calendar/SuggestionsRail.test.tsx` passes; `npm run lint` passes.

---

## Phase 4: User Story 2 - Cook from what I pick (Priority: P2)

**Goal**: An optional `ingredientItemIds?` on `POST /recommendations` scopes generation to a live, non-expired subset of inventory (falling back to whole-inventory on an empty/all-expired selection); two entry points — Kitchen select mode and suggestions-rail chips — converge on the one scoped request; grounding, caching, expiry prioritisation, FR-037, and the rate limit are all reused unchanged (FR-IR-005..011).

**Independent Test**: Select two inventory items in Kitchen select mode → "Find recipes with selected" → the returned suggestions are grounded on those two items and prioritise the sooner-expiring of them. Repeat via the suggestions-rail chips → same scoped result.

### Tests for User Story 2 (write first, must FAIL)

- [ ] T014 [P] [US2] Add failing handler tests in `packages/client/tests/server/recommendations.test.ts`: `getRecommendations(userId, [idA, idB])` (with `getMealRecommendations` stubbed) sends the agent **only** idA/idB's ingredient tuples, and `groundMeals` resolves only those items (FR-IR-005/008); calling again with the identical id set is a cache hit (the agent stub is called once, FR-IR-011/SC-IR-005). **[analyze M1]** Also assert the scoped tuples reach the agent stub in **expiry order** — seed idA expiring sooner than idB and assert idA precedes idB in the ingredient payload — proving expiry-prioritisation-within-selection is preserved by the subset filter (FR-IR-009), since the agent's own prioritisation is not unit-testable with a stub
- [ ] T015 [US2] Add a failing handler test in the same file: a selection whose ids are all expired, or absent from live inventory, or an empty array falls back to the whole non-expired set — the agent stub receives the full ingredient tuple set, not an empty one (FR-IR-010)
- [ ] T016 [US2] Add a failing route-level test in the same file: `POST /api/v1/recommendations` with body `{ ingredientItemIds: [...] }` parses via the T006 Zod schema and reaches the scoped controller path end-to-end (complements T014's controller-level test with route coverage)
- [ ] T017 [P] [US2] Add failing tests in `packages/client/tests/components/InventoryList.test.tsx` for select mode: an active select-mode prop renders a checkbox per row; ticking a row surfaces the item's `_id` through an `onToggleSelect`-shaped callback (FR-IR-006 Kitchen entry point)
- [ ] T018 [P] [US2] Add failing tests in `packages/client/tests/InventoryPage.test.tsx`: entering select mode and ticking ≥1 item shows a "Find recipes with selected" action bar; tapping it calls the scoped fetch with exactly the ticked ids (FR-IR-006/007, SC-IR-002's two-tap flow)
- [ ] T019 [P] [US2] Add failing tests in `packages/client/tests/components/calendar/SuggestionsRail.test.tsx`: ingredient-filter chips (one per inventory item from `useInventory().items`) toggle a selection; requesting suggestions with an active selection calls the same `fetchRecommendations(ids)` service with the chipped ids (FR-IR-006, SC-IR-004 — identical id set/output as the Kitchen path)

### Implementation for User Story 2

- [ ] T020 [US2] Update `getRecommendations` in `packages/client/src/server/controllers/recommendations.ts` to accept an optional `ingredientItemIds?: string[]` second parameter: after loading `activeItems = InventoryItem.find({ userId, ...notExpiredQuery() })`, intersect by `_id` when ids are provided; a non-empty intersection scopes `activeItems` to the subset, an empty/all-expired intersection uses `activeItems` unchanged (FR-IR-010 guard); the existing `ingredients` map → `buildCacheKey` → `getMealRecommendations` → `groundMeals` → `setCached` pipeline runs unchanged over the result (D1/D2/D8)
- [ ] T021 [US2] Wire `packages/client/app/api/v1/recommendations/route.ts` to pass the T006-parsed `ingredientItemIds` into `getRecommendations(userId, ids)` (removes the "parsed but unused" placeholder from Foundational)
- [ ] T022 [US2] Add select-mode support to `packages/client/src/components/inventory/InventoryList.tsx`: a `selectMode`/`selectedIds`/`onToggleSelect` prop set that renders a checkbox per row when active (FR-IR-006 Kitchen entry point)
- [ ] T023 [US2] Add select-mode state (`Set<string>`) and the "Find recipes with selected" action bar to `packages/client/src/views/InventoryPage.tsx`; resolve the ticked ids into an `ingredientItemIds` array
- [ ] T024 [US2] Accept an optional `ingredientItemIds?: string[]` scope prop on `RecommendationsPanel` (`packages/client/src/components/recommendations/RecommendationsPanel.tsx`, wired from `InventoryPage` in T023) and thread it into the `fetchFn`/`fetchRecommendationsService` call so the one "Get Recommendations" / "Find recipes with selected" action scopes exactly when a selection is active (FR-IR-007)
- [ ] T025 [US2] Add ingredient-filter chip state to `packages/client/src/components/calendar/SuggestionsRail.tsx` (built from `useInventory().items`) and call `fetchRecommendationsService(ids)` with the chipped selection when active (FR-IR-006 suggestions-rail entry point)

**Checkpoint**: both entry points converge on the one scoped/whole-inventory service call; cache, grounding, expiry prioritisation, FR-037, and the rate limit are all reused unchanged.

**US2 verification**: failing tests observed before implementation (no `ingredientItemIds` param on `getRecommendations`; no select mode; no chips). After implementation, focused `npx vitest run --coverage=false tests/server/recommendations.test.ts tests/components/InventoryList.test.tsx tests/InventoryPage.test.tsx tests/components/calendar/SuggestionsRail.test.tsx` passes; `npm run lint` passes.

---

## Phase 5: User Story 3 - Quick-add stops stacking duplicates (Priority: P3)

**Goal**: A quick-added item matching an existing non-expired, compatible-unit same-name item merges into it (no duplicate row) and surfaces a reversible "Undo" toast; expired or unit-incompatible same-name items are never merge targets (FR-IR-012, FR-IR-013).

**Independent Test**: With an existing "Milk" item, quick-add "milk 1L" → no duplicate row is created; the existing item's quantity increases and an "Undo" toast appears; tapping Undo restores the pre-merge state.

### Tests for User Story 3 (write first, must FAIL)

- [ ] T026 [P] [US3] Add a new failing unit test file `packages/client/tests/server/unit/inventory-merge.test.ts`: `findMergeTarget(userId, name, unit)` returns a same-name, non-expired, compatible-unit item and `null` when expired/incompatible/absent; `mergeInto(target, quantity, unit)` increments the target's quantity, unit-converted where needed (extracted from the existing `purchase-inventory.test.ts` merge-target coverage)
- [ ] T027 [US3] Add a failing regression test in `packages/client/tests/server/unit/purchase-inventory.test.ts` asserting `applyPurchase`/`reversePurchase` behave identically after the T030/T031 extraction (no behaviour change) — guards the "refactor, don't reinvent" reuse mandate
- [ ] T028 [P] [US3] Add failing tests in `packages/client/tests/server/inventory.test.ts` for `POST /api/v1/inventory`: `mergeDuplicates:true` against an existing non-expired, compatible-unit same-name item returns 200 `{ merged:true, item, mergedItemId, addedQuantity }` with exactly **one** row in storage (FR-IR-012); `mergeDuplicates` absent/false always creates (201, byte-identical to today); `mergeDuplicates:true` against an expired or unit-incompatible same-name item creates a new row (201) — consistent with spec 007 FR-GC-005
- [ ] T029 [P] [US3] Add failing RTL tests in `packages/client/tests/components/QuickAdd.test.tsx` (or `packages/client/tests/InventoryPage.test.tsx`): a quick-add that merges shows an Undo toast (via the T004-extended `ToastContext`); tapping Undo issues a subtract-`addedQuantity`-clamped-at-0 reversal (mirrors `reversePurchase`) and the toast dismisses (FR-IR-013, SC-IR-006)

### Implementation for User Story 3

- [ ] T030 [US3] Extract `findMergeTarget(userId, name, unit)` and `mergeInto(target, quantity, unit)` into new `packages/client/src/server/lib/inventory-merge.ts`, lifting `sameIngredient`/`canMergeUnits`/`convertQuantity`/`sameNameCandidates` out of `purchase-inventory.ts:29-52` (pure reuse, no behaviour change) so T026 passes
- [ ] T031 [US3] Refactor `applyPurchase` in `packages/client/src/server/lib/purchase-inventory.ts` to consume the extracted `findMergeTarget`/`mergeInto` instead of its inline predicates, so T027's regression test passes with zero behaviour change
- [ ] T032 [US3] Add an opt-in `mergeDuplicates` field to `createSchema` in `packages/client/src/server/controllers/inventory.ts` and branch `createInventory`: when true, call `findMergeTarget`; on a hit, `mergeInto` + `invalidateUser(userId)` + return `{ status:200, body:{ merged:true, item, mergedItemId, addedQuantity } }`; otherwise fall through to today's plain-create path unchanged (FR-IR-012)
- [ ] T033 [US3] Add the `mergeDuplicates: true` flag to the quick-add create call in `packages/client/src/views/InventoryPage.tsx`'s `handleAdd` — the **only** caller that opts in, so deliberate creates elsewhere keep `mergeDuplicates` absent
- [ ] T034 [US3] Surface the merge indicator from `addItem` in `packages/client/src/context/InventoryContext.tsx` so `InventoryPage.handleAdd` can detect a merge and trigger the Undo toast via `ToastContext.showToast(message, { label:'Undo', onAction })`, where `onAction` issues a `PUT`/`DELETE` (via `updateItem`/`deleteItem`) subtracting `addedQuantity` from current quantity, clamped ≥0, mirroring `reversePurchase` (FR-IR-013, D7)

**Checkpoint**: quick-add duplicates merge silently with a reversible Undo; deliberate creates elsewhere (any `POST /inventory` without the flag) are unaffected.

**US3 verification**: failing tests observed before implementation (no `inventory-merge.ts`; `createInventory` always inserted; no Undo toast). After implementation, focused `npx vitest run --coverage=false tests/server/unit/inventory-merge.test.ts tests/server/unit/purchase-inventory.test.ts tests/server/inventory.test.ts tests/components/QuickAdd.test.tsx` passes; `npm run lint` passes; full `npm test` passes.

---

## Phase 6: Polish & handoff (IR4)

**Purpose**: Full gate, conditional e2e updates, doc cascade, spec-001 cascade verification, and release handoff.

- [ ] T035 [P] Full verification: run `npm run lint`, `npm test`, `npm -w packages/client run build`, `npm -w packages/client run test:e2e`, `bash scripts/validate-e2e.sh --no-agent`, and record results in `specs/009-ingredient-recipe-search/quickstart.md` verification log
- [ ] T036 Review `packages/client/e2e/quick-add.e2e.ts` — update only if it asserts the old always-create duplicate behaviour that `mergeDuplicates` now changes; otherwise confirm it stays green as-is and note that in the verification log
- [ ] T037 Review `packages/client/e2e/recipe-links.e2e.ts` and `packages/client/e2e/redesign.e2e.ts` — update only if either asserts an auto-loaded recommendations panel on page load that IR1 now removes; otherwise confirm both stay green as-is and note that in the verification log
- [ ] T038 [P] Doc cascade in `CLAUDE.md` §4: update the Recommendations `POST` row (optional `ingredientItemIds` body scope, whole-inventory-on-empty/all-expired fallback) and the `POST /inventory` row (opt-in `mergeDuplicates` flag + additive `{merged, item, mergedItemId, addedQuantity}` response) per FR-IR-014
- [ ] T039 [P] Review `CLAUDE.md` §9 for the recommendations cache-key note — confirm the per-selection caching is emergent from the existing `buildCacheKey` ingredient-tuple keying (D2) and needs no new sentence; update only if the current text implies a whole-inventory-only cache
- [ ] T040 Verify the spec 001 cascade (FR-012 annotated user-triggered/no auto-load, FR-012/FR-014 recommendation area noted as supporting an optional grounded ingredient subset, EC-03 acceptance scenario changed from the classic Merge/Add-separately/Cancel prompt to auto-merge + Undo, per FR-IR-014) is present on `main` per plan.md's note that it was "already revised on `main`" — confirm no further drift in `specs/001-meal-planner/spec.md`, do not re-edit it from this branch
- [ ] T041 Review and tick completed tasks in `specs/009-ingredient-recipe-search/tasks.md` only after the corresponding targeted tests pass
- [ ] T042 Release handoff only: leave version tags, image pushes, Portainer redeploy notes, and the spec-001-cascade-merged checkbox unchecked in `specs/009-ingredient-recipe-search/quickstart.md` (left unchecked as required)

**IR4 verification**: full gate green; e2e reviewed (updated only if a genuine regression risk exists); doc cascade complete; release-handoff items intentionally left unchecked for the human/release flow.

---

## Dependencies

- **Foundational -> US1**: sequential by phase order, but IR1's removal/empty-state work does not actually consume T003-T008 — they exist purely so IR2/IR3 have their prerequisites ready before those phases start.
- **Foundational -> US2**: T006 (route Zod field) and T007 (client service param) are wired live in T020/T021/T024/T025 — IR2 cannot scope a request without them.
- **Foundational -> US3**: T003-T005 (`ToastContext` action support) are consumed by T034's Undo trigger; T008's typed `mergeDuplicates` placeholder is consumed by T032/T033.
- **US1 -> US2**: FR-IR-007's "one contextual action" scopes the *same* button IR1 established as the sole trigger — `RecommendationsPanel` must already be manual-trigger-only (T012/T013) before T024 makes it scope-aware.
- **US2 -> US3**: independent code paths (recommendations scoping vs. quick-add merge); sequenced by spec priority only, no technical coupling.
- Story order: **US1 -> US2 -> US3**.

## Parallel opportunities

- T003 (Toast test) and T006/T007/T008 (recommendations/inventory type plumbing) are independent Foundational tracks and can run in parallel.
- T009 and T011 are independent failing-test tasks for US1 (Kitchen panel vs. calendar-rail regression, different files).
- T014 (server), T017 (InventoryList), T018 (InventoryPage), and T019 (SuggestionsRail) are independent failing-test tasks across different files for US2 and can run in parallel; T015/T016 extend the same file as T014 and should follow it.
- T026, T028, and T029 are independent failing-test files for US3 (lib unit test, handler test, RTL test) and can run in parallel; T027 extends an existing file and can run alongside them.
- T038 and T039 (doc cascades) can run in parallel after implementation behaviour is stable.

## Implementation strategy

**MVP = US1**: remove the auto-load and add the manual CTA/empty-state with zero behaviour change to the whole-inventory path — the lowest-risk, independently shippable slice (no selection UI, no server change). Then US2 adds ingredient scoping via one optional request field, reusing the entire pipeline (agent, grounding, cache, FR-037, rate limit) unchanged, reached from two converging entry points. US3 rides along as a self-contained EC-03 fix on the quick-add surface, reusing spec 007's matcher and mirroring its reversal semantics for a transient client-side Undo. Each checkpoint should end with targeted tests green before any checkbox is marked complete.
