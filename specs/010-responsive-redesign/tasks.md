# Tasks: "The Fridge" Responsive Redesign (`impl/nextjs`)

**Input**: Design documents from `/specs/010-responsive-redesign/` (plan.md, research.md D1-D12, spec.md, design/responsive-system.md)
**Tests**: INCLUDED - TDD is mandatory (constitution / `CLAUDE.md` section 8); every story phase starts with failing tests citing FR-RS numbers.
**Organization**: Phases map 1:1 to spec user stories (US1-US6 = plan phases RS1-RS6) + Setup/Foundational + RS7 polish/verify/handoff. All paths relative to repo root.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1-US6, mapping to spec.md user stories

## Format note

This is a **presentation-layer** feature (plan.md "Data model & contract impact: none") — no `data-model.md`, no `contracts/`, no server-layer task. Every task below touches `app/`, `src/{components,views,context,hooks,lib}`, `tests/`, `e2e/`, or docs.

---

## Phase 1: Setup

**Purpose**: Establish the implementation baseline and confirm the exact reuse seams the plan/research name before touching any code.

- [ ] T001 Run `npm run lint && npm test` at repo root and record baseline notes in `specs/010-responsive-redesign/quickstart.md` verification log
- [ ] T002 Review the reuse seams plan.md/research.md name so later tasks don't reinvent them: `InventoryList`'s prop/handler signatures (D7 — Shelf wraps it unchanged), `RecommendationsPanel`'s existing `ingredientItemIds` prop (`009` IR2, reused verbatim by `UseItUpBanner` in Phase 7), `entryStatus()` (`src/types/meal-plan.ts:38`) and `handleTogglePurchased`/`receiptless.length` (`src/views/GroceryListPage.tsx:178-193`/`:140`) as the untouchable cook/purchase contracts, and `AuthContext`'s `sessionStorage` mount-effect pattern (`src/context/AuthContext.tsx:118-121`) as the established precedent for the new `localStorage` sidebar-collapse read (D3) — note in the quickstart verification log which later task each seam feeds

---

## Phase 2: Foundational

**Purpose**: Shared groundwork every story phase builds on — the five viewport classes, the `matchMedia` test stub, `useViewportClass()`, and the dead-code deletion that retires 42% of the FR-RS-024 token debt at zero product risk. Must land before any consumer.

- [ ] T003 [P] Add the five viewport classes to `packages/client/tailwind.config.ts` → `extend.screens` (never `theme.screens` — that would break the existing `sm:`/`lg:`/`min-[900px]:` utilities): keep default `sm`(640)/`lg`(1024)/`xl`(1280), and add `phland: { raw: '(max-width: 899px) and (orientation: landscape) and (max-height: 500px)' }` **last** in declaration order so it wins the cascade over `sm:` at 844px (D1, FR-RS-001); add `theme.extend.maxWidth.content = '1120px'` (design §1.3)
- [ ] T004 [P] Add a `window.matchMedia` stub plus an exported `setViewport(cls: ViewportClass)` helper (default `'desktop'`) to `packages/client/tests/setup.ts`, driven by a module-level "current viewport class" so any suite rendering `Nav`/`CalendarPage` doesn't throw `window.matchMedia is not a function` (D9) — lands before any consumer exists
- [ ] T005 [P] Add a failing test `packages/client/tests/hooks/useViewportClass.test.ts`: initial render returns `'desktop'` (matching the server-rendered default, no hydration mismatch), and after mount + `setViewport('phone')` + a `matchMedia` `change` event the hook returns `'phone'` (D4)
- [ ] T006 Add `packages/client/src/lib/viewport.ts` (the `ViewportClass` union + the five media-query strings, the single source shared by Tailwind's `phland` raw string and the hook, D1) and `packages/client/src/hooks/useViewportClass.ts` (`matchMedia` `change` subscription; `useState` initialised to `'desktop'`, applied in a mount effect — hydration-safe by construction, D4) so T005 passes
- [ ] T007 Grep-verify `src/views/CalendarPage.tsx` never imports `WeeklyCalendar`, `CalendarSlot`, `CalendarMealCard`, or `MealSlotCard` (confirming D8's dead-code finding — `CalendarPage` builds the grid inline at `:136-180`) and record the grep output in the quickstart verification log before deleting anything
- [ ] T008 Delete `packages/client/src/components/calendar/{WeeklyCalendar,CalendarSlot,CalendarMealCard,MealSlotCard}.tsx` and their tests `packages/client/tests/components/calendar/{WeeklyCalendar,CalendarMealCard,MealSlotCard}.test.tsx` (`CalendarSlot.tsx` has no dedicated test — reachable only from `WeeklyCalendar.tsx`) — retires 16 lines / 27 of the 65 off-token occurrences at zero product risk (D8, FR-RS-024)

**Foundational verification**: `npx vitest run --coverage=false tests/hooks/useViewportClass.test.ts` passes; `npm run lint` passes; `npm -w packages/client run build` still resolves with the four calendar files gone; no other test file's behavior changes yet.

---

## Phase 3: User Story 1 - The app fits my phone, my iPad, and my desktop (Priority: P1) MVP

**Goal**: A viewport-filling `AppShell` whose content region is the only scroll container; the shipped bottom pill nav extended into three modes (portrait pill / landscape rail / desktop collapsible sidebar) with a persisted collapse preference; a feedback affordance on every screen (FR-RS-001..007).

**Independent Test**: Load each of the four existing screens at phone portrait, phone landscape, iPad portrait, iPad landscape and desktop widths. Navigation is present and correctly positioned in each; no horizontal page scroll occurs; the nav never scrolls out of view; the desktop sidebar collapses and the preference survives a reload.

### Tests for User Story 1 (write first, must FAIL)

- [ ] T009 [P] [US1] Add a failing test `packages/client/tests/components/shell/AppShell.test.tsx`: renders an `h-dvh flex flex-col overflow-hidden` root, exactly one scrollable region (`<main>` with `flex-1 min-h-0 overflow-auto`), and one `box-border` padded wrapper carrying `max-w-content mx-auto` at the desktop viewport (FR-RS-004/005, SC-RS-001/002)
- [ ] T010 [US1] Rewrite `packages/client/tests/app/nav.test.tsx`: update the literal label assertions from `Kitchen`/`Meal plan`/`Groceries`/`Feedback` to `Home`/`Fridge`/`Plan`/`List` (spec 010 supersedes `004` FR-UI-009), add tests for the three positional modes (pill/rail/sidebar classes present per `setViewport()`) and for collapse persistence (`localStorage['fp:nav:collapsed']` read on mount, `data-nav-ready` gating so no visible collapse animation on a returning load) — keep the existing `aria-current`, `href` and `data-testid="kitchen-badge"` assertions unchanged, since those are behaviour, not labels (D3, D9, FR-RS-002/003, SC-RS-009)
- [ ] T011 [P] [US1] Add a failing test `packages/client/tests/components/shell/FeedbackAffordance.test.tsx`: renders a round bubble at the touch viewport classes and a labelled `Tell us` pill at desktop (design §2.3), positioned so it never overlaps the nav (FR-RS-006)
- [ ] T012 [US1] Update `packages/client/e2e/redesign.e2e.ts:16-17` label selectors from `getByRole('link', {name:'Kitchen'})`/`'Groceries'` to `'Fridge'`/`'List'`, in the same commit as the nav label change (D9)

### Implementation for User Story 1

- [ ] T013 [US1] Build `packages/client/src/components/shell/AppShell.tsx` (root `h-dvh flex flex-col overflow-hidden`; `<main>` `flex-1 min-h-0 overflow-auto` as the only scroll container; one `box-border` padded wrapper carrying the design §1.3 per-viewport padding + `max-w-content mx-auto`; `<Nav>`/`<FeedbackAffordance>` as siblings of `<main>`, outside the scroll container so they are structurally unable to scroll away) so T009 passes, and replace `app/layout.tsx`'s `min-h-screen bg-bg pb-24` + fixed `mx-auto max-w-shell px-7` with `<AppShell>{children}</AppShell>`; the brand header becomes `xl:hidden` since the sidebar carries the brand row (D2, FR-RS-001/004/005, SC-RS-001/002)
- [ ] T014 [US1] Extend `app/nav.tsx` — keep `TABS`, `isActive()`, the urgent-count badge and `next/link`; change labels to Home/Fridge/Plan/List against **unchanged** hrefs `/home`/`/`/`/calendar`/`/grocery`; add the three positional modes (pill/rail/sidebar) as responsive classes on the same element tree, with item internals switching icon-over-label (pill/rail) vs icon-beside-label (sidebar) (D3, FR-RS-002) so T010's mode assertions pass
- [ ] T015 [US1] Add sidebar-collapse `useState(false)` to `app/nav.tsx`, read from `localStorage['fp:nav:collapsed']` in a mount effect and written on toggle, gated behind a `data-nav-ready` attribute so a returning user's sidebar renders already-narrow instead of animating closed (D3, FR-RS-003, SC-RS-009) so T010's persistence assertions pass
- [ ] T016 [US1] Build `packages/client/src/components/shell/FeedbackAffordance.tsx` (design §2.3 geometry per viewport) and mount it in `AppShell` as a sibling of `<main>`; wire its click to navigate to `/feedback` as an interim target (Phase 8/T058 rewires it to open `QuickCaptureOverlay` instead) so T011 passes (FR-RS-006)

**Checkpoint**: all five viewport classes render the shell with the correct nav mode; sidebar collapse persists across reload; the feedback affordance is present and never overlaps the nav; no other screen's behaviour has changed yet.

**US1 verification**: failing tests observed before implementation (no `AppShell`, no `FeedbackAffordance`, old labels, single nav mode). After implementation, focused `npx vitest run --coverage=false tests/components/shell/AppShell.test.tsx tests/components/shell/FeedbackAffordance.test.tsx tests/app/nav.test.tsx` passes; `npm run lint` passes; manual DevTools check at all five sizes per quickstart steps 1-6.

---

## Phase 4: User Story 2 - The fridge shows me where things actually live (Priority: P2)

**Goal**: Inventory grouped into per-location shelf cards (Fridge/Freezer/Pantry + fallback), each item an `ItemChip` with a status dot plus a text expiry line and a 44px stepper that floors at zero; every shipped capability (expiry, edit, delete, `009` select mode, `005` parse preview) retained (FR-RS-008..011).

**Independent Test**: With items across all three locations, open the Kitchen: one shelf card per location with correct counts and tinted backgrounds; stepping a quantity persists and floors at zero without deleting the row; expiry status is visible; edit, delete and select-mode all still function.

### Tests for User Story 2 (write first, must FAIL)

- [ ] T017 [P] [US2] Add a failing test `packages/client/tests/components/inventory/Shelf.test.tsx`: one card per `LOCATIONS` value plus a fallback shelf for an out-of-enum location, each with its design §4.2.3 tint and an `N items` count; a zero-count shelf shows an empty hint rather than disappearing; edit/delete/select-mode affordances remain reachable through the shelf-wrapped `InventoryList` (FR-RS-008/010)
- [ ] T018 [P] [US2] Add a failing test in `packages/client/tests/components/InventoryList.test.tsx`: each item row/chip carries both the status dot and a text expiry line, so status is never colour-only (FR-RS-009)
- [ ] T019 [US2] Add a failing test in `packages/client/tests/InventoryPage.test.tsx`: stepping a quantity to zero floors at zero, the row remains with a neutral-dot state, quantity persists across reload, and the `${name} removed` toast no longer fires from the stepper path (it stays on the delete button) (FR-RS-009, D10)
- [ ] T020 [P] [US2] Add a failing regression test in `packages/client/tests/components/QuickAdd.test.tsx`: the pill-styled add field still surfaces the shipped `005` parse preview with correctable provenance chips beneath it (FR-RS-011)

### Implementation for User Story 2

- [ ] T021 [US2] Build `packages/client/src/components/inventory/Shelf.tsx` — one card per `LOCATIONS` (verified `['fridge','freezer','pantry']` at `src/server/models/inventory-item.ts:9`) plus a fallback shelf, design §4.2.3 tints, header `N items` count, empty hint — reusing `InventoryList` inside each shelf with its props/handlers unchanged (D7, FR-RS-008) so T017 passes
- [ ] T022 [US2] Extract the item-row markup from `InventoryList.tsx` into `packages/client/src/components/inventory/ItemChip.tsx` (status dot + text expiry line + stepper + edit/delete/select), keeping `InventoryList`'s prop and handler signatures unchanged (D7, FR-RS-009) so T018 passes
- [ ] T023 [US2] Enlarge `QuantityStepper`'s `−`/`+` hit areas from 30×30 to 44×44 (the visual glyph may stay compact; only the tappable area grows) (D7, FR-RS-025, SC-RS-003)
- [ ] T024 [US2] Change `InventoryPage.handleStep` (`:87-95`) to floor at zero without calling `removeItem` or showing the "removed" toast, and correct `InventoryList`'s stale `onStep` doc comment ("zero removes it" → floors at zero, delete stays the explicit destructive action) (D10, FR-RS-009) so T019 passes
- [ ] T025 [US2] Delete `packages/client/src/components/inventory/LocationFilter.tsx` and its `filter`/`visible` state in `InventoryPage.tsx` (superseded — shelves show every location at once, labelled); its `visibleCount`/`totalCount` readout moves onto the shelf headers (D7, FR-RS-008)
- [ ] T026 [US2] Compose `InventoryPage.tsx` to group `items` by `LOCATIONS` into per-location `Shelf` cards at the viewport's column count (1/2/3, design §1.2) in place of the flat list, preserving the existing select-mode `Set<string>` wiring and `009`'s "Find recipes with selected" action bar unchanged (FR-RS-008/010)
- [ ] T027 [US2] Apply the design §4.2 pill visual treatment to `QuickAdd.tsx`; leave `ParsePreview` and its provenance-chip correction flow entirely unchanged beneath it (FR-RS-011) so T020 passes

**Checkpoint**: Kitchen renders as three (or fallback) shelf cards with correct counts/tints; stepping floors at zero without deleting; expiry/edit/delete/select-mode all reachable; quick-add pill still parses.

**US2 verification**: failing tests observed before implementation (no `Shelf`/`ItemChip`; stepper deleted the row at zero). After implementation, focused `npx vitest run --coverage=false tests/components/inventory/Shelf.test.tsx tests/components/InventoryList.test.tsx tests/InventoryPage.test.tsx tests/components/QuickAdd.test.tsx` passes; `npm run lint` passes.

---

## Phase 5: User Story 3 - My week reads well on every screen (Priority: P3)

**Goal**: A responsive calendar hybrid — phone gets a seven-day strip + single-day list, iPad/desktop retain the shipped 7×4 dnd-kit grid verbatim — with exactly one layout mounted at a time, UTC date handling unchanged, and suggestions staying manual-trigger-only in both layouts (FR-RS-012..015).

**Independent Test**: At phone width, a day strip with a selected day and that day's meals; at iPad/desktop width, the seven-day grid with drag-and-drop intact. Suggestions are absent until requested, in both layouts.

### Tests for User Story 3 (write first, must FAIL)

- [ ] T028 [P] [US3] Add a failing test `packages/client/tests/components/calendar/DayStrip.test.tsx`: renders a 7-column strip with `role="tablist"` semantics, one selected day, a dot indicator on days containing meals, and an `onSelect` callback firing for the tapped day (FR-RS-012)
- [ ] T029 [US3] Add failing tests in `packages/client/tests/views/CalendarPage.test.tsx`: `setViewport('phone')` renders `DayStrip` + the selected day's meals (or the empty-state prompt "Nothing planned for this day yet…") and **not** the 7×4 grid; `setViewport('desktop')` renders the grid and **not** `DayStrip` — the exactly-one-layout assertion (D4, FR-RS-012/013); and in both viewport settings, mounting the page issues **zero** recommendation requests, with `SuggestionsRail`'s explicit CTA and `009` ingredient scoping unaffected (FR-RS-015)

### Implementation for User Story 3

- [ ] T030 [US3] Extract the shipped grid (`CalendarPage.tsx:136-180` — `DndContext`, the 6px `PointerSensor`, `overflow-x-auto`, `min-w-[720px] grid-cols-7`, `PlannedMealTile`, `EmptySlotTarget`) **verbatim** into `packages/client/src/components/calendar/WeekGrid.tsx` with zero behaviour change; `CalendarPage` renders `<WeekGrid>` in its place, keeping the grid's own `overflow-x-auto` scroll container (D4, FR-RS-007/013) — `tests/views/CalendarPage.test.tsx` and `e2e/calendar-dnd.e2e.ts` must stay green through this move, proving retention by diff
- [ ] T031 [US3] Build `packages/client/src/components/calendar/DayStrip.tsx` consuming the same `getWeekDays()`/`dowIndex`/`dayNumber` helpers as the grid (UTC-anchored, no local-date conversion per D4's rationale — the handoff's local-date advice is deliberately not applied) so T028 passes (FR-RS-012)
- [ ] T032 [US3] Build `packages/client/src/components/calendar/DayPlanList.tsx` (selected day's meals via `PlannedMealTile`, visually distinguishing cooked vs planned via the shipped `entryStatus()` at `src/types/meal-plan.ts:38`, and an empty-state prompt "Nothing planned for this day yet…") (FR-RS-012/014)
- [ ] T033 [US3] Add selected-day state to `CalendarPage.tsx` (default: today when inside the visible week, else the week's first day) and mount **exactly one** of `WeekGrid` vs `DayStrip`+`DayPlanList` via `useViewportClass()`, keeping `handleDragEnd`/`placeInto`/`getEntry`/`shiftWeek`, the cook/un-cook contract, and the UTC helpers exactly as shipped (D4, FR-RS-012/013/014) so T029 passes

**Checkpoint**: phone width shows the day strip + selected day's meals with no grid in the DOM; iPad/desktop width shows the grid with drag-and-drop intact and no strip in the DOM; `e2e/calendar-dnd.e2e.ts` stays green unmodified as the D4 guard.

**US3 verification**: failing tests observed before implementation (no `DayStrip`/`DayPlanList`; `CalendarPage` renders the grid unconditionally). After implementation, focused `npx vitest run --coverage=false tests/components/calendar/DayStrip.test.tsx tests/views/CalendarPage.test.tsx` passes; the existing `e2e/calendar-dnd.e2e.ts` run stays green; `npm run lint` passes.

---

## Phase 6: User Story 4 - Shopping and checkout feel right on a phone (Priority: P4)

**Goal**: A progress ring + responsive category columns on the grocery list, while spec `007`'s purchase/reversal semantics and spec `008`'s week scope stay byte-identical (FR-RS-016..019).

**Independent Test**: With a partially-checked list, the ring and counts match; toggling still adds/reverses inventory as shipped; the finish action's count equals the not-yet-added rows; finishing does not clear the list.

### Tests for User Story 4 (write first, must FAIL)

- [ ] T034 [P] [US4] Add a failing test `packages/client/tests/components/grocery/ProgressRing.test.tsx`: renders a conic-gradient ring plus a `checked/total` figure for given `purchased.length`/`items.length` inputs (FR-RS-016)
- [ ] T035 [US4] Add failing tests in `packages/client/tests/pages/GroceryListPage.test.tsx`: category groups render at the viewport's column count; the finish-shopping button's count equals `receiptless.length` (not the unchecked count) and completing it does **not** clear the list — the design's "N = unchecked, then clear" model is explicitly rejected (FR-RS-018 pin, reconciliation item 13); toggling a row still calls the unchanged `handleTogglePurchased` path — immediate add, exact reversal, `PurchasePromptSheet` where ambiguous (FR-RS-017 regression pin); the covered week (`weekLabel(currentWeekStart)`) is visible in the progress card (FR-RS-019)

### Implementation for User Story 4

- [ ] T036 [US4] Build `packages/client/src/components/grocery/ProgressRing.tsx` (conic-gradient, design §4.4.2) fed by the `purchased.length`/`items.length` already computed at `GroceryListPage.tsx:139-141` so T034 passes (FR-RS-016)
- [ ] T037 [US4] Lift `GroceryListPage.tsx`'s `max-w-[720px]` cap so category groups occupy the design §1.2 column counts inside the shell's 1120px desktop max; apply the design's row treatment to `GroceryListItemRow.tsx` while keeping its real checkbox semantics and existing `line-through`-on-checked assertion unchanged; wire in `ProgressRing`, and promote the already-rendered `weekLabel(currentWeekStart)` (`:238`) into the progress card (FR-RS-016/019) so T035's column/week-label assertions pass — `handleTogglePurchased` (`:178-193`) and `receiptless.length`/checkout (`:140`, `:325-333`) are touched only by their surrounding markup, never their logic (FR-RS-017/018)

**Checkpoint**: ring + counts match a partially-checked list; toggling still adds/reverses inventory exactly as shipped; the finish count is receipt-less rows only and finishing never clears; the covered week is visible.

**US4 verification**: failing tests observed before implementation (no `ProgressRing`; single-column layout; no week label in the progress area). After implementation, focused `npx vitest run --coverage=false tests/components/grocery/ProgressRing.test.tsx tests/pages/GroceryListPage.test.tsx` passes; `npm run lint` passes.

---

## Phase 7: User Story 5 - One screen answers "what now?" (Priority: P5)

**Goal**: A net-new Home dashboard at `/home` composed entirely from data three app-level contexts already hold, with a "use it up first" banner whose CTA issues the first and only recommendation call on tap (FR-RS-020..022).

**Independent Test**: Open Home with known data: the four counts match the underlying data, the banner names the correct soonest-expiring item, the cards link to the right screens, and no recommendation request is made on load.

### Tests for User Story 5 (write first, must FAIL)

- [ ] T038 [P] [US5] Add a failing test `packages/client/tests/lib/home-summary.test.ts`: `soonestExpiring(items)` returns the item with the fewest days left (reusing `daysLeft` from `src/lib/quick-parse.ts:397`) and `null` on an empty/no-expiry set; empty-state predicates for each of the four figures (FR-RS-020/021)
- [ ] T039 [P] [US5] Add a failing test `packages/client/tests/views/HomePage.test.tsx`: renders the four figures from `InventoryContext.summary`/`MealPlanContext.plan.entries`/`GroceryListContext`, the banner names the correct soonest-expiring item (or its calm alternative when none exists, per the spec edge case), the Tonight/Grocery-run/Fresh-picks cards link to `/calendar` and `/grocery`, and each shows a calm empty state with empty underlying data (FR-RS-020/022)
- [ ] T040 [US5] Add a failing test asserting `RecommendationsPanel`'s `fetchRecommendations` is **not** called on `HomePage` mount, and is called **exactly once** with `ingredientItemIds: [item._id]` after the `Cook this →` CTA is tapped (FR-RS-021, SC-RS-005)

### Implementation for User Story 5

- [ ] T041 [US5] Add net-new route `packages/client/app/home/page.tsx` at path `/home` wrapping `HomePage` in `GroceryListProvider` (mirroring `app/grocery/page.tsx:8-12` — not hoisted app-level, so the Kitchen/Calendar screens gain no request); `/` continues to render the Kitchen unchanged (D6, FR-RS-026)
- [ ] T042 [US5] Add `packages/client/src/lib/home-summary.ts`: `soonestExpiring(items)` and the empty-state predicates as pure functions, plus the checked/total pair `GroceryListPage.tsx:139-141` already computes, extracted so Home and `GroceryListPage` share one implementation rather than two (D6) so T038 passes
- [ ] T043 [US5] Build `packages/client/src/components/home/StatCard.tsx` (the four stat tiles, design §4.1.2) reading `InventoryContext.summary.{expiringSoon,total}` (server-computed, not re-derived), `MealPlanContext.plan.entries.length`, and the `home-summary.ts` grocery pair (FR-RS-020)
- [ ] T044 [US5] Build `packages/client/src/components/home/UseItUpBanner.tsx`: names the soonest-expiring item from already-fetched inventory via `soonestExpiring()`, shows the calm alternative when none exists (spec edge case), and its `Cook this →` action mounts `RecommendationsPanel` with `ingredientItemIds={[item._id]}` only on tap — no new endpoint, no new context (D6, FR-RS-021) so T040 passes
- [ ] T045 [US5] Build `packages/client/src/components/home/TonightCard.tsx` (reads `MealPlanContext`, links to `/calendar`) and `packages/client/src/components/home/GroceryRunCard.tsx` (reads `GroceryListContext`, links to `/grocery`), each with a calm empty state (FR-RS-022)
- [ ] T046 [US5] Build `packages/client/src/components/home/FreshPicksCard.tsx` (first 3 inventory items, empty state) (FR-RS-020/022)
- [ ] T047 [US5] Compose `packages/client/src/views/HomePage.tsx` from `StatCard`/`UseItUpBanner`/`TonightCard`/`GroceryRunCard`/`FreshPicksCard` and the app-level contexts, with **zero** additional data fetching beyond what `home/page.tsx`'s `GroceryListProvider` mount already triggers (FR-RS-020) so T039 passes

**Checkpoint**: `/home` shows four correct figures, the correct banner (or its calm alternative), working card navigation, calm empty states, and zero recommendation requests until the CTA is tapped.

**US5 verification**: failing tests observed before implementation (no `HomePage`, no `home-summary.ts`, no `/home` route). After implementation, focused `npx vitest run --coverage=false tests/lib/home-summary.test.ts tests/views/HomePage.test.tsx` passes; `npm run lint` passes; manual Network-tab check per quickstart steps 22-26.

---

## Phase 8: User Story 6 - Overlays and interactions are consistent and accessible (Priority: P6)

**Goal**: One shared `Overlay` primitive with a hand-rolled focus trap, retrofitted onto the three existing ad-hoc overlays plus the promoted consumption review; the 44px touch-target and off-token colour debt retired; reduced motion honoured (FR-RS-023..025).

**Independent Test**: Open each overlay on touch and desktop widths; verify sheet-vs-dialog presentation, outside-click and Escape dismissal, focus trapping and restoration; verify toasts are announced; audit controls for accessible names and touch-target size.

### Tests for User Story 6 (write first, must FAIL)

- [ ] T048 [P] [US6] Add a failing test `packages/client/tests/hooks/useFocusTrap.test.tsx`: on activation records `document.activeElement` and focuses the first tabbable node in the container; `Tab`/`Shift+Tab` cycle within the tabbable set without escaping; on deactivation focus is restored to the recorded element (D5, FR-RS-023, SC-RS-004)
- [ ] T049 [P] [US6] Add a failing test `packages/client/tests/components/shared/Overlay.test.tsx`: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` wired to `titleId`; scrim click and `Escape` both call `onClose`; sheet-vs-dialog presentation classes swap by viewport **without unmounting** (a rerender with `setViewport()` preserves component state, proving the CSS-only swap the spec's orientation-change edge case requires) (D5, FR-RS-023, SC-RS-004)
- [ ] T050 [P] [US6] Add/extend failing 44px touch-target assertions across `packages/client/tests/components/InventoryList.test.tsx` (edit/delete icon buttons 36→44, select checkbox 20→44), `packages/client/tests/views/CalendarPage.test.tsx` (week-nav chevrons 36→44), `packages/client/tests/app/nav.test.tsx` (pill nav items ~40→44), and `packages/client/tests/pages/GroceryListPage.test.tsx` (Regenerate button ~36→44) — `QuantityStepper`'s 44px hit area was already covered by T023 (FR-RS-025, SC-RS-003)
- [ ] T051 [US6] Add/extend a failing test for `packages/client/tests/components/shared/Toast.test.tsx` (or equivalent): renders top-centre (design §6) while retaining its existing `aria-live`/`role="status"` announcement (`Toast.tsx:11-13`) (FR-RS-025)

### Implementation for User Story 6

- [ ] T052 [US6] Build `packages/client/src/hooks/useFocusTrap.ts` (~30 lines, hand-rolled: record opener, focus first tabbable, cycle `Tab`/`Shift+Tab`, restore on deactivation — no new dependency) so T048 passes (D5, D12)
- [ ] T053 [US6] Build `packages/client/src/components/shared/Overlay.tsx` (`createPortal` to `document.body`; token scrim `color-mix(in srgb, var(--color-neutral-900) 45%, transparent)` with click-to-dismiss; CSS-only sheet-on-touch/dialog-on-desktop presentation; `role="dialog"`/`aria-modal`/`aria-labelledby`; `Escape` `keydown` listener; `useFocusTrap()`; `max-h-[88%] overflow-auto`) so T049 passes, plus a `prefers-reduced-motion` suppression block in `src/index.css` covering the sheet slide-up and scrim fade (D5, FR-RS-023/025)
- [ ] T054 [US6] Retrofit `packages/client/src/components/grocery/PurchasePromptSheet.tsx` onto `<Overlay>` (already sheet-vs-dialog + token scrim at `:46`; needs Escape/trap/restore) (FR-RS-023) — `tests/components/grocery/PurchasePromptSheet.test.tsx` must stay green through the retrofit
- [ ] T055 [US6] Retrofit `packages/client/src/components/inventory/EditItemSheet.tsx` onto `<Overlay>` (already has `role="dialog"`/`aria-modal`/`aria-labelledby`/Escape/scrim-click at `:35-60`; needs sheet-on-touch/trap/restore, and its `bg-black/40` scrim re-tokened at `:62`) (FR-RS-023/024) — `tests/components/inventory/EditItemSheet.test.tsx` must stay green
- [ ] T056 [US6] Hoist the consumption-review open state from `CookControls` (`MealDetailModal.tsx:115`) up to `CalendarPage`, promoting `ConsumptionReviewSheet` from an inline `<section>` (`:31`) to a standalone `<Overlay>` so the cook flow never nests overlays (D5); fix the `bg-cream/60` defect (no `cream` colour exists in `tailwind.config.ts`) to `bg-surface/60` (D8, FR-RS-023/024) — `tests/components/consumption-review-sheet.test.tsx` must stay green and the spec `006` data contract (grounded clamped lines, read-only untracked ingredients, receipt-based un-cook, FR-RS-014) must not change
- [ ] T057 [US6] Retrofit `packages/client/src/components/calendar/MealDetailModal.tsx` onto `<Overlay>`, remove `focus:outline-none` at `:214`, and re-token its 18 lines / 25 occurrences of off-token colour per the design §7 mapping (D8, FR-RS-023/024/025) — `tests/components/calendar/MealDetailModal.test.tsx` must stay green
- [ ] T058 [US6] Build `packages/client/src/components/feedback/QuickCaptureOverlay.tsx` on `<Overlay>` (additive quick-capture, design §5.4, with an "Open full feedback" link to `/feedback` — the chat/history/promote/pipeline surfaces stay exactly as shipped); rewire `FeedbackAffordance` (T016) to open it instead of navigating directly; add a secondary `Feedback` entry to the desktop sidebar below the four primary nav items so `/feedback` stays reachable from two places, and retarget `nav.test.tsx`'s `Feedback` `href` assertion to the sidebar entry (D11, FR-RS-006/023)
- [ ] T059 [US6] 44px touch-target pass: `InventoryList` edit/delete icon buttons and select checkbox, `CalendarPage` week-nav chevrons, `nav.tsx` pill items, `GroceryListPage` Regenerate button — each raised to a 44×44 tappable area (FR-RS-025, SC-RS-003) so T050 passes
- [ ] T060 [US6] Move `Toast.tsx` to top-centre positioning (design §6), keeping its existing `aria-live` wiring untouched (FR-RS-025) so T051 passes
- [ ] T061 [US6] Re-token the remaining live token debt: `packages/client/src/components/shared/AuthBanner.tsx` (2 lines/6 occurrences) and `packages/client/src/components/feedback/PipelineStatusView.tsx` (1 line/2 occurrences), per the design §7 mapping table (D8, FR-RS-024, SC-RS-008)

**Checkpoint**: every overlay is a sheet on touch / dialog on desktop with scrim + Escape dismissal and a trapped, restored focus; toasts announce top-centre; the 44px audit and the token-debt grep both pass; `/feedback` remains reachable from the bubble/pill overlay and the desktop sidebar.

**US6 verification**: failing tests observed before implementation (no `Overlay`/`useFocusTrap`; ad-hoc overlay markup per component; sub-44px controls; `bg-cream` compiling to nothing). After implementation, focused `npx vitest run --coverage=false tests/hooks/useFocusTrap.test.tsx tests/components/shared/Overlay.test.tsx tests/components/grocery/PurchasePromptSheet.test.tsx tests/components/inventory/EditItemSheet.test.tsx tests/components/consumption-review-sheet.test.tsx tests/components/calendar/MealDetailModal.test.tsx tests/app/nav.test.tsx` passes; the token-audit grep (quickstart step 35) returns nothing; `npm run lint` passes; full `npm test` passes.

---

## Phase 9: Polish & handoff (RS7)

**Purpose**: Full gate, the mandatory five-viewport Playwright suite, doc cascade, spec-010 drift verification, and release handoff.

- [ ] T062 [P] Add five named Playwright viewport projects to `packages/client/playwright.config.ts` — `phone-portrait` (390×844), `phone-landscape` (844×390), `ipad-portrait` (820×1180), `ipad-landscape` (1180×820), `desktop` (1440×900, replacing today's single `chromium` project as the new baseline) — with `testMatch` scoping so only `e2e/responsive.e2e.ts` runs on all five and the existing 10 specs stay on `desktop` alone (D9)
- [ ] T063 Write `packages/client/e2e/responsive.e2e.ts` covering, per the five projects: nav mode and position, `document.documentElement.scrollWidth === document.documentElement.clientWidth` (no horizontal scroll, SC-RS-001), nav fixed while content scrolls (SC-RS-002), sidebar collapse + reload persistence (SC-RS-009), day strip vs 7×4 grid per viewport, one overlay's sheet-vs-dialog presentation (SC-RS-004), and — via one explicit `setViewportSize` from 390×844 to 844×390 with an overlay open — the orientation-change state/focus-retention edge case; assert the 844×390 padded wrapper's computed `padding-left` is `96px` (the D1 cascade-ordering proof) (CLAUDE.md §8, D9, FR-RS-001..006)
- [ ] T064 Full verification gate: `npm run lint`, `npm test`, `npm -w packages/client run build`, `npm -w packages/client run test:e2e`, `bash scripts/validate-e2e.sh --no-agent` — record results in `specs/010-responsive-redesign/quickstart.md` verification log (SC-RS-007 — all shipped capabilities remain available, verified by the existing regression suites continuing to pass)
- [ ] T065 [P] Doc cascade in `CLAUDE.md`: §3 add `app/home/`, `src/components/shell/`, `src/hooks/`, the new `home/`/`inventory/{Shelf,ItemChip}`/`calendar/{WeekGrid,DayStrip,DayPlanList}`/`grocery/ProgressRing` component paths, and note the four deleted dead calendar components; §7 state the five viewport classes (mobile-first `min-width`, plus the one raw `phland` query) as a documented convention; §13 quick reference — note §4/§5 need no change since there is no API/model change (FR-RS-026)
- [ ] T065a **[analyze L1 — SC-RS-006 traceability]** Assert the no-new-endpoint claim by diff rather than by assertion: run `git diff --stat origin/impl/nextjs...HEAD -- packages/client/app/api packages/client/src/server` and confirm it reports **no changes** (Home composes its four figures purely from existing endpoints via `home-summary.ts`); record the command and its empty output in the quickstart verification log (SC-RS-006, FR-RS-020/026)
- [ ] T066 Spec-cascade VERIFY: confirm `specs/010-responsive-redesign/spec.md` is unedited by this branch (spec 010 originates on `main` per `specs/BRANCHING_STRATEGY.md`) and that no drift exists between the shipped implementation and its FR-RS-001..026/SC-RS-001..009 statements; record the confirmation in the quickstart verification log — do **not** edit `spec.md` (FR-RS-026, keeps `004`'s SC-UI-008 verifiable)
- [ ] T067 Review and tick completed tasks in `specs/010-responsive-redesign/tasks.md`, only after each task's targeted tests pass
- [ ] T068 Release handoff only: leave `specs/010-responsive-redesign/quickstart.md`'s release-handoff checkboxes (version tag, image push/Portainer redeploy, post-deploy smoke, real-device five-viewport verification, `004`-file-untouched confirmation, API-diff confirmation, route-rename follow-up queue) **unchecked** for the human/release flow

**RS7 verification**: full gate green; `e2e/responsive.e2e.ts` passes on all five projects and the existing 10 specs stay green on `desktop`; doc cascade complete; spec-010 drift check recorded; release-handoff items intentionally left unchecked.

---

## Dependencies

- **Foundational -> US1**: T003 (Tailwind screens) and T006 (`useViewportClass`) are consumed directly by T013/T014 (AppShell padding, nav modes); T004 (`matchMedia` stub) must land before T009/T010/T011 render anything that calls the hook or mounts `Nav`.
- **Foundational -> US3/US6**: T006's `useViewportClass()` is the mount-one-layout mechanism T033 depends on, and the same hook drives `Overlay`'s presentation swap consumed in T053.
- **US1 -> US2/US3/US4**: `AppShell` (T013) and the extended `Nav` (T014/T015) must exist before any view is restructured inside it — Shelf/DayStrip/ProgressRing all render inside the shell's padded content region.
- **US1 -> US5**: Home (Phase 7) mounts inside the same `AppShell`/`Nav`, and its `FeedbackAffordance` reuse (T016) is a US1 artifact.
- **US2 -> US6**: `ItemChip`'s stepper (T022/T023) and `Shelf`'s edit/select affordances are retrofitted for 44px in T059, so US2 must land first.
- **US3 -> US6**: `MealDetailModal`'s retrofit (T057) and the `ConsumptionReviewSheet` hoist (T056) both sit inside `CalendarPage`, which US3 (T033) restructures — the hoist must target the post-T033 `CalendarPage`.
- **US1 -> US6 (feedback)**: `FeedbackAffordance` (T016, US1) is rewired to `QuickCaptureOverlay` in T058 (US6) — US1 must exist first, but US6 does not block US1 (the interim `/feedback` navigation in T016 is fully functional on its own).
- **US4/US5 are independent of US2/US3** beyond sharing `AppShell` — no technical coupling between shelves/calendar and grocery/home.
- Story order given priorities: **US1 -> US2 -> US3 -> US4 -> US5 -> US6**.

## Parallel opportunities

- T003 (Tailwind config) and T004 (`matchMedia` stub) are independent Foundational tracks and can run in parallel; T005 depends on T004 existing (the stub) but not on T003.
- T009 and T011 are independent failing-test tasks for US1 (`AppShell` vs `FeedbackAffordance`, different files).
- T017, T018, T020 are independent failing-test tasks for US2 across different files (`Shelf`, `InventoryList`, `QuickAdd`) and can run in parallel; T019 touches `InventoryPage.test.tsx` and can run alongside them.
- T034 (`ProgressRing` test) is independent of T035 (`GroceryListPage` test) and can run in parallel.
- T038 and T039 are independent failing-test files for US5 (`home-summary.ts` unit test vs `HomePage` RTL test) and can run in parallel; T040 extends the same `HomePage` surface and should follow T039.
- T048 and T049 are independent failing-test files for US6 (`useFocusTrap` vs `Overlay`) and can run in parallel; T050 spans several existing test files and can run alongside them.
- T062 (Playwright projects) and T065 (doc cascade) are independent RS7 tracks and can run in parallel once the full gate (T064) is green.

## Implementation strategy

**MVP = US1**: the viewport-filling shell and the three-mode nav make the four existing screens usable on real devices with zero change to any view's internal content — the lowest-risk, independently shippable slice. US2 then regroups the Kitchen into shelves while reusing `InventoryList` wholesale, so its shipped edit/delete/expiry/select-mode behaviour (and RTL coverage) survive unchanged; the one deliberate behaviour change (step-to-zero floors instead of deletes, D10) is called out explicitly. US3 extracts the shipped grid verbatim before adding the phone day strip, so drag-and-drop retention is a diff review rather than a re-test. US4 is the smallest story — a progress ring and a lifted column cap around byte-identical purchase logic. US5 is genuinely new but reads only data three existing contexts already hold, so it has no derivation risk beyond the two pure `home-summary.ts` helpers. US6 closes cross-cutting gaps last, retrofitting one shared `Overlay` primitive onto surfaces that already do most of the work (`PurchasePromptSheet` first, as the lowest-risk validation of the primitive) and retiring the token/touch-target debt the earlier stories didn't touch. Each checkpoint should end with targeted tests green before any checkbox is marked complete.
