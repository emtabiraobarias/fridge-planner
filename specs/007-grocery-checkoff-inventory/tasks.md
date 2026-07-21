# Tasks: Grocery Check-Off Flows Into Kitchen Inventory (`impl/nextjs`)

**Input**: Design documents from `/specs/007-grocery-checkoff-inventory/` (plan.md, spec.md, research.md, data-model.md, contracts/grocery-checkoff-api.md, quickstart.md)
**Tests**: INCLUDED - TDD is mandatory (constitution / `CLAUDE.md` section 8); every story phase starts with failing tests citing FR-GC numbers.
**Organization**: Phases map 1:1 to spec user stories (US1-US4 = plan phases GC1-GC4) + polish (GC5). All paths relative to repo root.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1-US4, mapping to spec.md user stories

## Phase 1: Setup

**Purpose**: Establish the implementation baseline and avoid mixing generated/local files into feature commits.

- [x] T001 Run `npm run lint && npm test` at repo root and record baseline notes in `specs/007-grocery-checkoff-inventory/quickstart.md`
- [x] T002 Review existing grocery checkout assertions in `packages/client/tests/server/grocery-lists.test.ts` and note old FR-032 expectations plus FR-GC-014 cascade status in `specs/007-grocery-checkoff-inventory/tasks.md`

**T002 note (2026-07-18)**: `packages/client/tests/server/grocery-lists.test.ts` currently has `POST grocery-lists/[weekStart]/complete` coverage for the old FR-032 contract where the client submits purchased items and checkout creates inventory. US4 must consciously rewrite that into revised FR-GC-011/FR-GC-014 semantics: server loads the list, skips receipted lines, adds only remaining receipt-less lines, stores receipts, and marks them purchased.

---

## Phase 2: Foundational

**Purpose**: Shared purchase model/types used by all stories before endpoint behavior changes.

- [x] T003 [P] Add `PurchaseReceipt` and `ResolvedPurchaseInput` server types in `packages/client/src/server/types/grocery-list.ts`
- [x] T004 [P] Mirror `PurchaseReceipt`, `ResolvedPurchaseInput`, and revised payload/result types in `packages/client/src/types/grocery-list.ts`
- [x] T005 Add `purchaseReceipt` to the grocery item subdocument in `packages/client/src/server/models/grocery-list.ts` with `_id:false` and no schema default
- [x] T006 Extract/reuse category-to-location defaults from `packages/client/src/lib/quick-parse.ts` into `packages/client/src/lib/category-location.ts`

**Foundational verification (2026-07-18)**: `npx vitest run --coverage=false tests/lib/quick-parse.test.ts tests/server/grocery-lists.test.ts tests/context/GroceryListContext.test.tsx` passed (69 tests); `npm run lint` passed.

---

## Phase 3: User Story 1 - Checked off means it is in my kitchen (Priority: P1) MVP

**Goal**: Ticking a grocery line immediately adds or merges inventory exactly once and records a receipt (FR-GC-001..006, FR-GC-012..013).

**Independent Test**: seed a list, tick a line, verify Kitchen inventory changes immediately; fire the same tick twice and verify one add plus a 409/refetch path.

### Tests for User Story 1 (write first, must FAIL)

- [x] T007 [P] [US1] Add failing unit tests in `packages/client/tests/server/unit/purchase-inventory.test.ts` for real-amount add, servings merge, learned-unit create, expired same-name create-new, incompatible-unit create-new, and cross-user isolation (FR-GC-001/004/005/006/013)
- [x] T008 [US1] Add failing handler tests in `packages/client/tests/server/grocery-lists.test.ts` for PATCH tick immediate add, purchase receipt storage, manual-line parity, duplicate tick 409, exactly-once inventory under retry, and recommendation cache invalidation (FR-GC-001/002/003/012)
- [x] T009 [P] [US1] Add failing context tests in `packages/client/tests/context/GroceryListContext.test.tsx` for purchase-aware `togglePurchased` response handling and refetch-on-409 behavior (FR-GC-002)

### Implementation for User Story 1

- [x] T010 [US1] Create `packages/client/src/server/lib/purchase-inventory.ts` with `applyPurchase(userId, line, resolved?)` add/merge logic and `PurchaseReceipt` return value
- [x] T011 [US1] Update `packages/client/src/server/controllers/grocery-lists.ts` so PATCH `isPurchased:true` uses an atomic unpurchased-to-purchased guard, calls `applyPurchase`, writes `purchaseReceipt`, and calls `invalidateUser(userId)`
- [x] T012 [US1] Update `packages/client/src/server/controllers/grocery-lists.ts` zod schema to accept `resolvedPurchase` alongside `isPurchased:true`
- [x] T013 [US1] Add `checkOffGroceryItem`/purchase-aware patch helpers in `packages/client/src/services/grocery-lists.ts`
- [x] T014 [US1] Update `packages/client/src/context/GroceryListContext.tsx` to patch list state from purchase responses and refetch on 409
- [x] T015 [P] [US1] Update purchased/receipted display in `packages/client/src/components/grocery/GroceryListItemRow.tsx` without relying on color alone

**Checkpoint**: one-tap check-off is shippable alone; inventory changes immediately and duplicate ticks do not double-add.

**US1 verification (2026-07-18)**: failing tests were observed before implementation (`purchase-inventory` missing; PATCH had no inventory side effects; duplicate tick returned 200/200; context did not refetch on 409). After implementation, focused `npx vitest run --coverage=false tests/server/unit/purchase-inventory.test.ts tests/server/grocery-lists.test.ts tests/context/GroceryListContext.test.tsx tests/components/grocery/GroceryListItemRow.test.tsx` passed (38 tests); `npm run lint` passed; full `npm test` passed (54 files, 529 tests, coverage 92.83%); `npm -w packages/client run build` passed.

---

## Phase 4: User Story 2 - Un-tick actually un-buys (Priority: P2)

**Goal**: Un-checking reverses inventory from the stored receipt, clamped safely, and clears the grocery-line purchase state (FR-GC-007..008, FR-GC-012..013).

**Independent Test**: tick then un-tick a created item and a merged item; verify inventory returns to its prior state when untouched and clamps after intervening consumption.

### Tests for User Story 2 (write first, must FAIL)

- [x] T016 [US2] Extend failing unit tests in `packages/client/tests/server/unit/purchase-inventory.test.ts` for `reversePurchase`: created item deletion, merged decrement, clamped reversal, externally deleted target no-op, and cross-user isolation (FR-GC-007/008/013)
- [x] T017 [US2] Extend failing handler tests in `packages/client/tests/server/grocery-lists.test.ts` for PATCH un-tick clears state/receipt, double un-tick 409/no double reverse, legacy purchased-without-receipt 409, and recs cache invalidation on reverse (FR-GC-007/008/012)
- [x] T018 [P] [US2] Extend failing context tests in `packages/client/tests/context/GroceryListContext.test.tsx` for un-tick state updates and wrong-state refetch behavior

### Implementation for User Story 2

- [x] T019 [US2] Add `reversePurchase(userId, receipt)` to `packages/client/src/server/lib/purchase-inventory.ts` with exact receipt-driven decrement/delete and live-stock clamp
- [x] T020 [US2] Update `packages/client/src/server/controllers/grocery-lists.ts` so PATCH `isPurchased:false` guards on purchased-with-receipt, calls `reversePurchase`, clears receipt/state, and invalidates recs cache
- [x] T021 [US2] Update `packages/client/src/services/grocery-lists.ts` and `packages/client/src/context/GroceryListContext.tsx` for explicit uncheck behavior and wrong-state 409 refetch
- [x] T022 [US2] Update `packages/client/src/components/grocery/GroceryListItemRow.tsx` to keep un-check ergonomics consistent for receipted lines

**Checkpoint**: mis-taps are reversible without guessing and never make inventory negative.

**US2 verification (2026-07-18)**: failing tests were observed before implementation (`reversePurchase` missing; un-tick left inventory intact; duplicate un-ticks returned 200/200; legacy purchased rows could be toggled without receipts). After implementation, focused `npx vitest run --coverage=false tests/server/unit/purchase-inventory.test.ts tests/server/grocery-lists.test.ts tests/context/GroceryListContext.test.tsx` passed (42 tests); `npm run lint` passed; full `npm test` passed (54 files, 538 tests, coverage 92.90%); `npm -w packages/client run build` passed. T022 required no extra component code beyond the existing row toggle; receipt state remains visible from US1 and the same checkbox path now reverses through the controller.

---

## Phase 5: User Story 3 - A quick prompt only when the app cannot infer (Priority: P3)

**Goal**: Ambiguous servings lines open a compact prompt; inferred lines remain one-tap; confirmed corrections feed alias memory (FR-GC-009..010).

**Independent Test**: tick an ambiguous servings line -> prompt opens prefilled; confirm creates inventory; cancel leaves the line untouched; inferable lines skip the prompt.

### Tests for User Story 3 (write first, must FAIL)

- [x] T023 [P] [US3] Add failing component tests in `packages/client/tests/components/grocery/PurchasePromptSheet.test.tsx` for prefilled quantity/unit/location, labelled controls, expiry suggestion apply-only-on-tap, cancel, and confirm payload (FR-GC-009/010)
- [x] T024 [US3] Add failing view tests in `packages/client/tests/pages/GroceryListPage.test.tsx` for ambiguous prompt open/cancel/confirm and promptless inferred tick using inventory and alias cache (FR-GC-004/009)
- [x] T025 [P] [US3] Add failing context tests in `packages/client/tests/context/GroceryListContext.test.tsx` for resolved purchase payload forwarding and alias-unit correction call path (FR-GC-010)

### Implementation for User Story 3

- [x] T026 [US3] Create `packages/client/src/components/grocery/PurchasePromptSheet.tsx` with numeric quantity, unit, location, optional expiry suggestion, Cancel, and Confirm controls
- [x] T027 [US3] Add prompt decision/build helpers in `packages/client/src/views/GroceryListPage.tsx` using `useInventory()` and `useQuickAdd()` alias cache
- [x] T028 [US3] Wire prompt confirm/cancel flows in `packages/client/src/views/GroceryListPage.tsx` so cancel does not call PATCH and confirm sends `resolvedPurchase`
- [x] T029 [US3] Persist confirmed unit corrections through existing quick-add alias APIs from `packages/client/src/views/GroceryListPage.tsx`
- [x] T030 [US3] Update `packages/client/src/context/QuickAddContext.tsx` only if current alias cache APIs do not expose enough unit/expiry data for prompt inference

**Checkpoint**: common lines remain one tap; ambiguous lines become safe structured inventory adds.

**US3 verification (2026-07-18)**: failing tests were observed before implementation (`PurchasePromptSheet` missing; `purchaseItem` missing from context; grocery page did not prompt or forward resolved purchase input). After implementation, focused `npx vitest run --coverage=false tests/components/grocery/PurchasePromptSheet.test.tsx tests/pages/GroceryListPage.test.tsx tests/context/GroceryListContext.test.tsx` passed (22 tests); `npm run lint` passed; full `npm test` passed (55 files, 545 tests, coverage 93.03%); `npm -w packages/client run build` passed. T030 required no `QuickAddContext` code change because existing `enhance` and `recordCorrection` APIs exposed the needed learned-unit and expiry-suggestion data.

---

## Phase 6: User Story 4 - Checkout finalizes what is left (Priority: P4)

**Goal**: Done shopping adds only receipt-less lines through the same purchase rules, skips already-added lines, and marks the list complete/purchased (FR-GC-011, SC-GC-005).

**Independent Test**: tick 2 of 4 lines, run checkout, verify the two receipted lines are skipped and the remaining two are added exactly once.

### Tests for User Story 4 (write first, must FAIL)

- [x] T031 [US4] Rewrite checkout tests in `packages/client/tests/server/grocery-lists.test.ts` for receipt skip, promptless defaults for ambiguous remaining lines, receipt storage for checkout-added lines, and all-lines-purchased final state (FR-GC-011)
- [x] T032 [P] [US4] Add e2e test `packages/client/e2e/grocery-checkoff.e2e.ts` for tick -> Kitchen shows item -> un-tick -> gone -> mixed checkout skip behavior
- [x] T033 [P] [US4] Update smoke expectations in `scripts/smoke-test.sh` to revised FR-032 checkout semantics

### Implementation for User Story 4

- [x] T034 [US4] Update `packages/client/src/server/controllers/grocery-lists.ts` `completeGroceryList` to load server-side list items, skip `purchaseReceipt`, call `applyPurchase` for remaining lines, and store receipts
- [x] T035 [US4] Update checkout payload/result handling in `packages/client/src/services/grocery-lists.ts`, `packages/client/src/context/GroceryListContext.tsx`, and `packages/client/src/views/GroceryListPage.tsx`
- [x] T036 [US4] Update `packages/client/src/views/GroceryListPage.tsx` checkout copy/counting so "Done shopping" reflects remaining receipt-less lines instead of already purchased count

**Checkpoint**: mid-shop ticks and final checkout compose with exactly one inventory addition per line.

**US4 verification (2026-07-18)**: failing checkout tests were updated from old FR-032 client-authoritative semantics to revised FR-GC-011 server-authoritative semantics. Focused `npx vitest run --coverage=false tests/server/grocery-lists.test.ts tests/pages/GroceryListPage.test.tsx tests/context/GroceryListContext.test.tsx` passed (43 tests); `npm run lint` passed; full `npm test` passed (55 files, 546 tests, coverage 92.94%); `npm -w packages/client run build` passed; `env NEXT_DIST_DIR=.next-e2e npx next build` passed; focused `npx playwright test e2e/grocery-checkoff.e2e.ts` passed (1 test). First Playwright attempt without a fresh `.next-e2e` build failed against stale code; rerun after rebuilding passed.

---

## Phase 7: Polish & handoff (GC5)

- [x] T037 Full verification: run `npm run lint`, `npm test`, `npm -w packages/client run build`, `npm -w packages/client run test:e2e`, `bash scripts/validate-e2e.sh --no-agent`, and record results in `specs/007-grocery-checkoff-inventory/quickstart.md`
- [x] T038 [P] Doc cascade in `CLAUDE.md`: update section 4 Grocery Lists PATCH/complete rows and section 5 GroceryList model with `purchaseReceipt` (FR-GC-014)
- [x] T039 [P] Update deployment/smoke documentation in `docs/smoke-test.md` if smoke checkout behavior changed
- [x] T040 Review and tick completed tasks in `specs/007-grocery-checkoff-inventory/tasks.md` only after the corresponding targeted tests pass
- [x] T041 Release handoff only: leave version tags, image pushes, and Portainer redeploy notes unchecked in `specs/007-grocery-checkoff-inventory/quickstart.md`

**GC5 verification (2026-07-18)**: after commit `1185746`, doc cascade and smoke docs were updated. `npm run lint` passed; `npm test` passed (55 files, 546 tests, coverage 92.94%); `npm -w packages/client run build` passed; `npm -w packages/client run test:e2e` passed (13 Playwright tests) after updating the legacy redesign checkout e2e to the spec 007 receipt-less checkout semantics; `bash scripts/validate-e2e.sh --no-agent` passed with `pass=15 fail=0` when rerun with Docker/local-server permissions. The first smoke attempt without escalation failed because Docker socket access was sandbox-denied.

---

## Dependencies

- **Foundational -> US1**: receipt types/model must exist before purchase controller behavior.
- **US1 -> US2**: un-tick needs receipts produced by tick.
- **US1 -> US3**: prompt confirmation sends the same resolved purchase payload consumed by tick.
- **US1 -> US4**: checkout reuses `applyPurchase` and skips receipts.
- **US3 is independent of US2** once US1 exists, but should follow US2 to keep row toggle behavior stable.
- Story order: **US1 -> US2 -> US3 -> US4**.

## Parallel opportunities

- T003, T004, and T006 can run in parallel after setup.
- T007, T008, and T009 are independent failing-test tasks for US1.
- T016, T017, and T018 cover different layers for US2.
- T023 and T025 can run while T024 maps view-level prompt behavior.
- T032 and T033 can run while T031 defines server checkout coverage.
- T038 and T039 can run after implementation behavior is stable.

## Implementation strategy

**MVP = US1**: immediate purchase add with receipt and idempotency. Then US2 makes it safe to reverse, US3 improves ambiguous input quality without changing server trust boundaries, and US4 completes the revised checkout contract. Each checkpoint should end with targeted tests green before any checkbox is marked complete.
