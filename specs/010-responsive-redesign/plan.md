# Implementation Plan: "The Fridge" Responsive Redesign (`impl/nextjs`)

**Branch**: `010-implement` · **Date**: 2026-07-25 · **Spec**: [`spec.md`](spec.md)
**Input**: Feature specification from `specs/010-responsive-redesign/spec.md` + canonical visual reference [`design/responsive-system.md`](design/responsive-system.md)

> **Per-branch plan** (not on `main`). This is the `impl/nextjs` implementation plan for shared spec `010`. It is a **presentation-layer** feature: no endpoint, no schema, no server-layer change. It supersedes named `004` requirements (tab labels; phone calendar layout/placement; Kitchen list treatment) rather than editing `004` in place, so `004`'s `SC-UI-008` diff-verifiable boundary stays true (FR-RS-026). Everything specs `005`–`009` shipped is **retained**; where the handoff's design contradicts shipped behaviour, the reconciliation table in `spec.md` is binding and this plan names the file where each retention is honoured.

## Summary

Deliver spec 010 in six increments mapping 1:1 to the spec's stories, plus a polish/verify phase. **RS1** builds the responsive foundation: five viewport classes as Tailwind `screens` additions, a viewport-filling `AppShell` whose content region is the only scroll container, and the existing bottom pill nav extended into three modes (portrait pill / landscape rail / desktop collapsible sidebar) with a persisted collapse preference (US1) — independently shippable, and it immediately makes the four existing screens usable on real devices. **RS2** regroups the Kitchen into per-location shelf cards with editable item chips, retaining expiry, edit, delete and `009` select mode (US2). **RS3** makes the calendar a responsive hybrid: a phone day-strip + single-day list, and the shipped 7×4 dnd-kit grid retained verbatim on iPad/desktop, with exactly one of the two layouts mounted at a time (US3). **RS4** restyles the grocery list to a progress ring + multi-column category groups while preserving spec `007` purchase semantics and surfacing spec `008`'s week scope (US4). **RS5** adds the net-new Home dashboard at `/home`, composed entirely from data three existing app-level contexts already hold, with a "use it up first" banner whose CTA issues the first and only recommendation call on tap (US5). **RS6** extracts one shared sheet/dialog `Overlay` primitive with a hand-rolled focus trap, retrofits the three existing ad-hoc overlays, retires the 44px touch-target and off-token colour debt, and deletes four dead calendar components that carry 27 of the 65 off-token occurrences (US6). **RS7** verifies, cascades docs, and hands off.

**No new npm dependency.** Tailwind 3.4 already provides `dvh` units and arbitrary `screens`; `lucide-react` already carries every icon the design names; the focus trap is ~30 lines and hand-rolled (see Research D5/D12). **No new React context** — the sidebar preference and the phone calendar's selected day are local component state (the spec's two ephemeral states), and Home reads contexts that are already mounted app-level.

## Technical Context

**Language/Version**: TypeScript (strict) on Node 20 / React 18 / Next.js 15 App Router — one process on `:3000`.
**Primary Dependencies**: existing only — `tailwindcss ^3.4.0` (arbitrary `screens` + `dvh` units), `lucide-react ^0.400.0` (`Home`, `Refrigerator`, `Calendar`, `ShoppingCart`, `MessageCircle`, `Sparkles`, `Clock`, `ChevronLeft`, `ChevronRight`, `Check`, `PanelLeft`), `@dnd-kit/core ^6.3.1` (retained, grid-only), React 18 `useState`/`useEffect`. **No new npm dependencies** — explicitly including no focus-trap library, no media-query library, no headless-UI/dialog library, no state store (CLAUDE.md §14).
**Storage**: none server-side. One `localStorage` key (`fp:nav:collapsed`) for the desktop sidebar preference (FR-RS-003, SC-RS-009) — the app's first `localStorage` use; auth already uses `sessionStorage` (`src/context/AuthContext.tsx:118-121`), so the `typeof window !== 'undefined'` guard pattern is established.
**Testing**: Vitest + RTL (`jsdom`) for every new component and every retrofit; `tests/setup.ts` gains a `window.matchMedia` stub (jsdom ships none — Research D9) plus a `setViewport()` helper so a component test can assert per-viewport-class behaviour. Playwright gains `e2e/responsive.e2e.ts` driving all five viewport classes (the CLAUDE.md §8 per-feature rule) via named projects, and the existing 10 specs stay on the desktop project. No server-layer test changes — no server code changes.
**Target Platform**: existing web app, now explicitly five viewport classes — phone portrait `<640px`, phone landscape `<900px` + landscape + `max-height:500px`, iPad portrait `640–1023px`, iPad landscape `1024–1279px`, desktop `≥1280px` (design §1.1).
**Project Type**: web — single `packages/client` package (UI + Route Handlers + `src/server`). Only `app/` and `src/{components,views,context,lib}` are touched.
**Performance Goals**: constitution §IV — FCP < 1.5s, INP < 200ms. Layout adaptation is **CSS-only** everywhere except the calendar's structural split, so no extra hydration work and no layout thrash; exactly one calendar layout is mounted, so dnd-kit never runs hidden (Research D4). Home adds one `GET /grocery-lists/:weekStart` on its own route only, and **zero** AI calls on load (FR-RS-021, SC-RS-005).
**Constraints**: mobile-first `min-width` breakpoints (constitution §III); Context + hooks only, no new store; no `src/pages/`; no server-layer import changes; complexity ≤10 per function; explicit return types; no `any`; Tailwind tokens only (FR-RS-024); WCAG 2.1 AA with 44px minimum targets (FR-RS-025); UTC date handling stays exactly as shipped — the handoff's local-date advice is **not** applied (spec Assumptions, design §4.3 note).
**Scale/Scope**: 4 existing views + 1 net-new view; ~14 existing components touched, ~10 net-new; 4 dead components deleted; 64 Vitest files and 10 Playwright specs in scope for regression.

## Constitution Check

*Gate evaluated against root `constitution.md` (v3.1.1) + `CLAUDE.md` §7/§8/§14. Re-check after Phase 1 design: PASS.*

- **Strict typing / no `any` / explicit return types** PASS — `ViewportClass` is a typed union; `OverlayProps`, `ShelfProps`, `StatCardProps` are declared interfaces; the `useFocusTrap` hook returns a typed ref; `exactOptionalPropertyTypes` is respected by spread-omitting optional props (the pattern already used at `src/views/InventoryPage.tsx:160`).
- **Component purity / SRP** PASS — `AppShell`, `Nav`, `Overlay`, `Shelf`, `ItemChip`, `DayStrip`, `ProgressRing`, `StatCard` are each presentational; all logic stays in the existing contexts and in `CalendarPage`/`InventoryPage`/`GroceryListPage`, which keep ownership of handlers and pass them down unchanged.
- **Hooks for logic extraction** PASS — two new hooks only: `useViewportClass()` (matchMedia, Research D4) and `useFocusTrap()` (Research D5). Both are pure, unit-tested, and used by more than one caller.
- **Zero lint warnings** PASS — the gate is `npm run lint` at the end of every phase.
- **TDD** PASS — every phase starts with failing tests citing FR-RS numbers (e.g. `it('insets content away from the landscape rail (FR-RS-005)')`), then implementation.
- **Unit coverage >80% for logic; ≥70% client threshold** PASS — `useViewportClass`, `useFocusTrap` and the Home derivation helpers are pure and directly unit-tested; the 70% Vitest threshold in `vitest.config.ts` remains the enforced floor and the full suite is the final gate.
- **Integration testing of critical flows via RTL** PASS — the retained flows (edit/delete/select-mode, cook/un-cook, purchase toggle, checkout, parse preview) keep their existing RTL tests; those tests are asserted-on rather than rewritten wherever they are behaviour-coupled (Research D9).
- **Mobile-first `min-width` breakpoints** PASS — every added screen is `min-width`-based except the one genuinely orientation-and-height-bound phone-landscape class, which cannot be expressed as a min-width (Research D1); phone portrait is the unprefixed base.
- **Fluid layouts over fixed pixel widths** PASS — column counts are `grid-cols-*` at breakpoints, content is `width:100%` with a single `max-w-[1120px]` desktop cap; the calendar keeps its own `overflow-x-auto` container (FR-RS-007).
- **Semantic HTML + keyboard navigability + WCAG 2.1 AA** PASS — this is the story-6 payload: real `<button>`/`<input type="checkbox">` controls with accessible names, `role="dialog"`/`aria-modal`/`aria-labelledby`, focus trap + restoration, `aria-live` toasts (already present at `src/components/shared/Toast.tsx:11-13`), `:focus-visible` outline (already global at `src/index.css:55-58`), 44px targets, and `prefers-reduced-motion` suppression.
- **Centralized theme/design tokens via Tailwind config** PASS — FR-RS-024 is the enforcement: 65 off-token occurrences across 9 files are retired (27 by deleting dead code), including the non-existent `bg-cream` utility.
- **Route-based code splitting / narrow client-JS boundaries** PASS — Home is its own route segment; no view gains a heavier client boundary; the calendar mounts one layout instead of two, which is strictly less client work than today plus a hidden duplicate would be.
- **Memoization only where profiling justifies** PASS — no new `useMemo`/`useCallback` beyond what already exists; the viewport hook uses a `matchMedia` subscription, not a resize-listener recompute.
- **API-first / RFC 7807 / versioned paths / rate limiting** PASS by non-participation — **zero** API surface change (FR-RS-026, SC-RS-006, verifiable by diff of `app/api/`).
- **Data model principles** PASS by non-participation — no schema change; `expirationStatus` is never written by client code, and the shelf/chip work reaches inventory only through the existing `editItem`/`removeItem` context methods.
- **No embeddings / no new service / no state library / no `src/pages/` / no Express** PASS (CLAUDE.md §14) — nothing here adds a service or a store; the only new module kinds are React components and two hooks.
- **Branch discipline** PASS — spec + design reference came from the shared spec branch; `plan.md`, `research.md`, `quickstart.md` and `tasks.md` are per-branch `impl/nextjs` artifacts. `004`'s superseded requirements are recorded as superseded in `spec.md`, not edited (FR-RS-026).

## Data model & contract impact: none

Deliberately **no `data-model.md` and no `contracts/`** in this feature's artifact set. FR-RS-026 forbids a new data model, a new endpoint and any route rename, and SC-RS-006 makes the absence of an API diff a success criterion. There is nothing to model and nothing to contract: every figure, list and overlay in this redesign reads data that existing endpoints already return through existing contexts.

The spec's two **ephemeral client-side states** — the only new state of any kind — are:

1. **Desktop sidebar collapsed preference** — `boolean`, owned by `Nav`, persisted to `localStorage` under `fp:nav:collapsed`, never sent to the server (FR-RS-003, SC-RS-009). Research D3.
2. **Phone calendar selected day** — an ISO date string, owned by `CalendarPage`, transient per visit, defaulting to today when today falls inside the visible week and to the week's first day otherwise (FR-RS-012). Research D4.

Neither is persisted server-side, neither appears in any request body, and neither is shared through a context.

## Project Structure

### Documentation (this feature)

```text
specs/010-responsive-redesign/
├── spec.md                       # canonical (shared, from main)
├── design/responsive-system.md   # canonical visual reference (shared, from main)
├── checklists/requirements.md    # spec-quality checklist (all items pass)
├── plan.md                       # THIS FILE
├── research.md                   # D1..D12
├── quickstart.md                 # dev/test walkthrough + verification log + release handoff
└── tasks.md                      # authored in a later step, not here
   (no data-model.md, no contracts/ — see "Data model & contract impact: none")
```

### Source Code (repository root)

```text
packages/client/
├── tailwind.config.ts                      # RS1 — extend.screens (5 viewport classes incl. raw `phland`);
│                                           #        maxWidth.content = 1120px (design §1.3)
├── app/
│   ├── layout.tsx                          # RS1 — replace `min-h-screen …pb-24` + fixed `max-w-shell px-7`
│   │                                       #        with <AppShell>; brand header becomes xl:hidden (RS1/RS3 of nav)
│   ├── nav.tsx                             # RS1 — EXTEND the existing pill into 3 modes + collapse persistence
│   │                                       #        (FR-RS-002/003); labels Home/Fridge/Plan/List (supersedes 004 FR-UI-009)
│   ├── providers.tsx                       # RS6 — mount <FeedbackQuickCapture /> once, app-level (FR-RS-006)
│   ├── page.tsx                            # unchanged path `/` → InventoryPage (FR-RS-026: no rename)
│   ├── home/page.tsx                       # RS5 — NEW net-new route; wraps HomePage in GroceryListProvider (D6)
│   ├── calendar/page.tsx                   # unchanged
│   ├── grocery/page.tsx                    # unchanged
│   └── feedback/page.tsx                   # unchanged — the full surface stays (reconciliation item 16)
├── src/
│   ├── index.css                           # RS1/RS6 — @media (prefers-reduced-motion) suppression block;
│   │                                       #            sheet/scrim keyframes; no token changes
│   ├── lib/
│   │   ├── viewport.ts                     # NEW RS1 — ViewportClass union + the 5 media-query strings (single source)
│   │   └── home-summary.ts                 # NEW RS5 — pure derivations for the 4 figures + soonest-expiring item
│   ├── hooks/
│   │   ├── useViewportClass.ts             # NEW RS1 — matchMedia subscription, SSR default 'desktop' (D4)
│   │   └── useFocusTrap.ts                 # NEW RS6 — hand-rolled trap + restoration (D5, D12)
│   ├── components/
│   │   ├── shell/
│   │   │   ├── AppShell.tsx                # NEW RS1 — 100dvh flex column; content region = only scroll container
│   │   │   │                               #            (FR-RS-004); per-viewport padding on ONE wrapper (FR-RS-005)
│   │   │   └── FeedbackAffordance.tsx       # NEW RS1 — bubble on touch / `Tell us` pill on desktop (FR-RS-006)
│   │   ├── shared/
│   │   │   ├── Overlay.tsx                 # NEW RS6 — the shared sheet/dialog primitive (FR-RS-023)
│   │   │   ├── Toast.tsx                   # RS6 — move to top-centre per design §6; aria-live already correct
│   │   │   └── AuthBanner.tsx              # RS6 — token debt (2 lines / 6 occurrences)
│   │   ├── home/
│   │   │   ├── StatCard.tsx                # NEW RS5 — 4 stat tiles (design §4.1.2)
│   │   │   ├── UseItUpBanner.tsx           # NEW RS5 — names soonest-expiring item; CTA scopes recs ON TAP (FR-RS-021)
│   │   │   ├── TonightCard.tsx             # NEW RS5 — reads MealPlanContext; links to /calendar (FR-RS-022)
│   │   │   ├── GroceryRunCard.tsx          # NEW RS5 — reads GroceryListContext; links to /grocery (FR-RS-022)
│   │   │   └── FreshPicksCard.tsx          # NEW RS5 — first 3 inventory items + empty state
│   │   ├── inventory/
│   │   │   ├── Shelf.tsx                   # NEW RS2 — one card per LOCATIONS value + fallback shelf (FR-RS-008)
│   │   │   ├── ItemChip.tsx                # NEW RS2 — dot + name + stepper + edit/delete/select (FR-RS-009/010)
│   │   │   ├── QuantityStepper.tsx         # RS2/RS6 — 30×30 → 44×44 hit areas (FR-RS-025); visual per design §4.2
│   │   │   ├── InventoryList.tsx           # RS2 — kept as the flat renderer used INSIDE each shelf (reuse, not rebuild)
│   │   │   ├── LocationFilter.tsx          # RS2 — DELETE (superseded by shelves; D7)
│   │   │   ├── QuickAdd.tsx                # RS2 — pill visual treatment only; parse preview untouched (FR-RS-011)
│   │   │   ├── EditItemSheet.tsx           # RS6 — retrofit onto <Overlay> (FR-RS-023); token debt (bg-black/40)
│   │   │   └── UseSoonStrip.tsx            # RS2 — retained; the Home banner is its richer sibling, not a replacement
│   │   ├── calendar/
│   │   │   ├── WeekGrid.tsx                # NEW RS3 — the shipped 7×4 dnd-kit grid EXTRACTED verbatim from CalendarPage
│   │   │   ├── DayStrip.tsx                # NEW RS3 — 7-column phone strip, tablist semantics (FR-RS-012)
│   │   │   ├── DayPlanList.tsx             # NEW RS3 — selected day's meals + empty state (FR-RS-012)
│   │   │   ├── PlannedMealTile.tsx         # RS3 — unchanged behaviour; cooked/planned distinction (FR-RS-014)
│   │   │   ├── EmptySlotTarget.tsx         # RS3 — unchanged (grid only)
│   │   │   ├── MealDetailModal.tsx         # RS6 — retrofit onto <Overlay>; 18 lines / 25 occurrences of token debt
│   │   │   ├── ConsumptionReviewSheet.tsx  # RS6 — promoted to a standalone <Overlay>; `bg-cream` fix; contract unchanged
│   │   │   ├── SuggestionsRail.tsx         # RS3 — manual-trigger + scoping retained verbatim (FR-RS-015)
│   │   │   ├── WeeklyCalendar.tsx          # RS6 — DELETE (dead; 6 lines / 8 occurrences of token debt)
│   │   │   ├── CalendarSlot.tsx            # RS6 — DELETE (dead; 1 line / 4 occurrences)
│   │   │   ├── CalendarMealCard.tsx        # RS6 — DELETE (dead; 5 lines / 9 occurrences)
│   │   │   └── MealSlotCard.tsx            # RS6 — DELETE (dead; 4 lines / 6 occurrences)
│   │   ├── grocery/
│   │   │   ├── ProgressRing.tsx            # NEW RS4 — conic-gradient ring + checked/total (FR-RS-016)
│   │   │   ├── GroceryListItemRow.tsx      # RS4 — row treatment; real checkbox semantics retained
│   │   │   └── PurchasePromptSheet.tsx     # RS6 — retrofit onto <Overlay> (already half-responsive at :46)
│   │   ├── feedback/
│   │   │   ├── QuickCaptureOverlay.tsx     # NEW RS6 — additive quick-capture (design §5.4); route NOT displaced
│   │   │   └── PipelineStatusView.tsx      # RS6 — token debt (1 line / 2 occurrences)
│   │   └── recommendations/
│   │       └── RecommendationsPanel.tsx    # RS5 — reused as-is on Home with `ingredientItemIds` (no new props)
│   └── views/
│       ├── HomePage.tsx                    # NEW RS5 — composes the Home dashboard (US5)
│       ├── InventoryPage.tsx               # RS2 — shelf composition; select mode + Undo toast retained
│       ├── CalendarPage.tsx                # RS3 — owns selected-day state; renders ONE of WeekGrid/DayStrip+DayPlanList
│       ├── GroceryListPage.tsx             # RS4 — ring + multi-column; receiptless count (:140) + label (:331) unchanged
│       └── FeedbackPage.tsx                # RS1 — responsive padding only; chat/history/promote/pipeline untouched
└── tests/
    ├── setup.ts                            # RS1 — window.matchMedia stub + setViewport() helper (D9)
    ├── app/nav.test.tsx                    # RS1 — REWRITTEN for new labels + 3 modes + collapse persistence
    ├── hooks/useViewportClass.test.ts       # NEW RS1
    ├── hooks/useFocusTrap.test.tsx          # NEW RS6
    ├── components/shell/AppShell.test.tsx    # NEW RS1
    ├── components/shared/Overlay.test.tsx    # NEW RS6
    ├── components/inventory/Shelf.test.tsx   # NEW RS2
    ├── components/calendar/DayStrip.test.tsx # NEW RS3
    ├── views/HomePage.test.tsx              # NEW RS5
    ├── lib/home-summary.test.ts             # NEW RS5
    ├── components/calendar/{WeeklyCalendar,CalendarMealCard,MealSlotCard}.test.tsx  # RS6 — DELETE with their subjects
    └── … 60 remaining files                # regression; behaviour-coupled assertions preserved (D9)

packages/client/e2e/
├── responsive.e2e.ts                       # NEW RS1→RS6 — the five viewport classes (CLAUDE.md §8 per-feature rule)
├── redesign.e2e.ts                         # RS1 — nav label assertions updated (Kitchen→Fridge, Groceries→List)
├── calendar-dnd.e2e.ts                     # RS3 — unchanged, and it is the guard that one layout mounts (D4)
└── … 8 remaining specs                     # regression on the desktop project
playwright.config.ts                        # RS1 — named viewport projects (D9)
```

**Structure Decision**: everything lands in the existing single `packages/client` app; no server file is touched, so `SC-RS-006`'s "no new endpoint, verifiable by diff" is structurally guaranteed. Three organising choices carry the plan: **(1)** the shell is a component (`src/components/shell/AppShell.tsx`) rather than logic inside `app/layout.tsx`, so it is unit-testable — `app/layout.tsx` is excluded from coverage (`vitest.config.ts:29`) and would otherwise hide the FR-RS-004/005 rules from tests. **(2)** The shipped 7×4 calendar grid is **extracted verbatim** from `CalendarPage` into `WeekGrid.tsx` before the phone layout is added, so `git diff` shows the grid moving, not changing — the cheapest possible proof that FR-RS-013's drag-and-drop retention holds. **(3)** `InventoryList` is kept and reused *inside* each shelf rather than replaced, so the shipped expiry/edit/delete/select-mode behaviour and its existing RTL coverage survive the regrouping (FR-RS-010, SC-RS-007).

## Phase breakdown (each phase ends runnable + tests green; phases = spec stories)

1. **RS1 — The app fits my phone, my iPad, and my desktop (US1/P1, MVP).** Add the five viewport classes to `tailwind.config.ts` `extend.screens` — `sm`/`lg`/`xl` already align with the design's 640/1024/1280 boundaries, so only the raw `phland` query is net-new, and it is declared **last** so it wins the cascade over `sm:` at the same specificity (Research D1). Add `src/lib/viewport.ts` as the single source of the five query strings and `useViewportClass()` for the one place JS is unavoidable (Research D4). Replace `app/layout.tsx`'s `min-h-screen bg-bg pb-24` + fixed `mx-auto max-w-shell px-7` with `<AppShell>`: a `h-dvh` flex column whose `<main>` is `flex-1 min-h-0 overflow-auto` and whose nav sits outside it, with `box-sizing: border-box` on the single padded wrapper carrying the design §1.3 per-viewport padding (FR-RS-004/005 — both of the design's "hard-won" implementation notes are requirements, and both are what SC-RS-001/002 measure). Extend `app/nav.tsx` — **not** rebuild it: keep the component, the `isActive` logic, the urgent-count badge (`data-testid="kitchen-badge"`, `nav.tsx:56`) and `next/link`, and add the landscape rail and desktop sidebar as responsive classes on the same tree plus a collapse toggle persisted to `localStorage` (FR-RS-002/003, Research D3). Labels become Home/Fridge/Plan/List (superseding `004` FR-UI-009) against **unchanged** hrefs `/home`, `/`, `/calendar`, `/grocery` (FR-RS-026). Add `FeedbackAffordance` with the design §2.3 geometry per viewport (FR-RS-006), and keep `/feedback` reachable from it (Research D11). Global brand header becomes `xl:hidden` because the sidebar carries the brand row. Independent test: all five viewport classes at all four existing screens — nav present and correctly positioned, no horizontal page scroll, nav fixed while content scrolls, sidebar collapse surviving reload.
2. **RS2 — The fridge shows me where things actually live (US2/P2).** Group `items` by the shipped `LOCATIONS` enum — verified `['fridge','freezer','pantry']` at `src/server/models/inventory-item.ts:9` — into `Shelf` cards at the design §1.2 column counts, with the design §4.2 tints, header count, zero-count empty hint, and a fallback shelf for any out-of-enum location so items are never dropped (FR-RS-008, spec edge cases). Each item becomes an `ItemChip` carrying the status dot **plus a text expiry line** so status is never colour-only (FR-RS-009), the quantity stepper, and the edit/delete/select affordances — reusing `QuantityStepper` (enlarged to 44px, FR-RS-025) and the existing `onStep`/`onEdit`/`onDelete`/`onToggleSelect` handlers `InventoryPage` already owns, so `009` select mode and the `009` Undo-toast quick-add path are untouched (FR-RS-010/011). `LocationFilter` is deleted as superseded — shelves *are* the location view (Research D7). `QuickAdd` gets the design §4.2 pill treatment with `ParsePreview` beneath it entirely unchanged (FR-RS-011). Independent test: items across all three locations → one shelf per location with correct counts and tints; stepping persists; expiry visible; edit/delete/select-mode all reachable; parse preview still appears.
3. **RS3 — My week reads well on every screen (US3/P3).** First extract the shipped grid (`CalendarPage.tsx:136-180` — `DndContext`, `PointerSensor` 6px activation, `overflow-x-auto`, `min-w-[720px] grid-cols-7`, `PlannedMealTile`, `EmptySlotTarget`) verbatim into `WeekGrid.tsx` with no behaviour change; then add `DayStrip` + `DayPlanList` for phone. `CalendarPage` keeps every handler (`handleDragEnd`, `placeInto`, `getEntry`, `shiftWeek`) and the UTC helpers (`getUTCDate`/`getUTCDay`, `getWeekDays`) **exactly as shipped** — the handoff's local-date advice is deliberately not applied (design §4.3 note) — and mounts **exactly one** of the two layouts via `useViewportClass()` (Research D4: rendering both would duplicate dnd-kit draggable ids and make `e2e/calendar-dnd.e2e.ts`'s `getByLabel(TILE).first()` + `boundingBox()` ambiguous). Selected-day state lives in `CalendarPage`, defaulting to today when today is in the visible week. Cooked meals stay visually distinct via the shipped `entryStatus()` (`src/types/meal-plan.ts:38`, absent status reads as cooked for legacy entries) and the cook/un-cook contract is untouched (FR-RS-014). `SuggestionsRail` keeps its explicit CTA and `009` scoping (FR-RS-015). Independent test: phone width → day strip with a selected day, that day's meals, has-meals dots, empty-state prompt; iPad/desktop → the 7×4 grid with drag-and-drop still moving a meal; neither layout fetches suggestions on load.
4. **RS4 — Shopping and checkout feel right on a phone (US4/P4).** Add `ProgressRing` (conic-gradient, design §4.4.2) fed by the `purchased.length`/`items.length` **already computed** at `GroceryListPage.tsx:139-141`, and lift the view's `max-w-[720px]` cap so category groups can occupy the design §1.2 column counts inside the shell's 1120px desktop max (FR-RS-016). Row toggling continues to call the unchanged `handleTogglePurchased` (`:178-193`) so spec `007`'s immediate add / exact reversal / ambiguous-quantity `PurchasePromptSheet` path is byte-identical (FR-RS-017). The checkout button keeps `receiptless.length` (`:140`) as its count and its "does not clear" semantics (`:325-333`) — the design's "N = unchecked, then clear" model is rejected per reconciliation item 13 (FR-RS-018). The week label already rendered at `:238` (`weekLabel(currentWeekStart)`) is promoted into the progress card so spec `008`'s rolling day-anchored shed reads as intended rather than as a bug (FR-RS-019). Independent test: ring and counts match a partially-checked list; toggling still adds/reverses inventory; the finish count equals receipt-less rows; finishing does not clear; the covered week is visible.
5. **RS5 — One screen answers "what now?" (US5/P5).** Net-new route `app/home/page.tsx` at path `/home` — Home is *conceptually* the landing surface but `/` cannot be reassigned without renaming the Kitchen route, which FR-RS-026 forbids (Research D6; the deferred rename follow-up is where `/` becomes Home). All four figures come from contexts already mounted app-level in `app/providers.tsx`: **items needing use soon** and **total items tracked** from the server-computed `InventoryContext.summary` (`{total, expired, expiringSoon}`, `src/services/inventory.ts:19-23`) — not re-derived client-side; **meals planned this week** from `MealPlanContext.plan.entries`; **shopping progress** from `GroceryListContext`, which is mounted on the Home route only (mirroring `app/grocery/page.tsx`) so the other three screens gain no request (FR-RS-020, SC-RS-006). `home-summary.ts` holds the soonest-expiring pick and the empty-state predicates as pure, unit-tested functions. The `UseItUpBanner` names the soonest-expiring item from already-fetched inventory and its `Cook this →` CTA calls the existing `009` scoped path — `RecommendationsPanel` with `ingredientItemIds={[itemId]}` — so **no** recommendation/AI request is issued on load and exactly one is issued on tap (FR-RS-021, SC-RS-005). Cards link to `/calendar` and `/grocery` and each shows a calm empty state (FR-RS-022). Independent test: known data → all four figures match, banner names the right item, cards navigate correctly, Network tab shows zero `POST /recommendations` on load and one after the CTA.
6. **RS6 — Overlays and interactions are consistent and accessible (US6/P6).** Build `Overlay.tsx`: portal to `document.body`, token scrim (`color-mix(neutral-900 45%)`) with click-to-dismiss, bottom sheet with grab handle on touch classes / centred dialog on desktop via **CSS only** so an orientation change swaps presentation without unmounting (spec edge case: state and trapped focus survive), `role="dialog"` + `aria-modal` + `aria-labelledby`, Escape to close, and `useFocusTrap()` for trapping + restoration to the opening control (FR-RS-023, SC-RS-004). Retrofit in dependency order: `PurchasePromptSheet` (already half-responsive at `:46`, lowest risk) → `EditItemSheet` (has Escape + dialog semantics, needs trap/restore/sheet) → `MealDetailModal` → `ConsumptionReviewSheet`, which is promoted from an inline `<section>` (`ConsumptionReviewSheet.tsx:31`) to a standalone overlay whose open state is hoisted to `CalendarPage`, so the cook flow is never a nested overlay and the phone day-list can open it directly (Research D5) — its spec `006` data contract (grounded, inventory-clamped lines; read-only untracked ingredients; receipt-based un-cook with 409 on legacy entries) is not touched (FR-RS-014). Then the debt: **delete** the four dead calendar components and their three tests (27 of 65 off-token occurrences retired by deletion, Research D8), re-token the five live files, fix `bg-cream` → `bg-surface`/`bg-bg`, remove the `focus:outline-none` at `MealDetailModal.tsx:214`, raise every sub-44px target (steppers 30px, icon buttons 36px, select checkbox 20px, nav items, week-nav buttons), add the `prefers-reduced-motion` block, and add `QuickCaptureOverlay` as additive feedback quick-capture that leaves `/feedback` fully intact (FR-RS-024/025, SC-RS-003/008). Independent test: every overlay sheet-on-touch / dialog-on-desktop, scrim + Escape dismissal, focus trapped and restored; toasts announced; a repo-wide grep for off-token colours returns zero; a 44px audit passes.
7. **RS7 — Polish, verify, cascade, hand off.** Full gates: `npm run lint`, `npm test`, `npm -w packages/client run build`, `npm -w packages/client run test:e2e` (including the new five-viewport `responsive.e2e.ts`), `bash scripts/validate-e2e.sh --no-agent`. Update `CLAUDE.md` §3 (new `app/home` route, `src/components/shell`, `src/hooks`), §7 (the five viewport classes as a stated convention), and the §13 quick reference. Record the `004` supersessions as already stated in `spec.md` (no `004` edits — FR-RS-026). Fill the `quickstart.md` verification log; leave release-handoff checkboxes unchecked for the human release flow.

## Complexity Tracking

*No constitution violations to justify.* The load-bearing judgments:

- **(a) The breakpoint work is almost free.** Tailwind's default `sm`/`lg`/`xl` already sit exactly on the design's 640/1024/1280 boundaries, so four of the five viewport classes need **no config at all** — only phone landscape needs a `raw` screen, because it is the one class defined by orientation *and* height rather than width (Research D1). The app currently uses only 7 responsive utilities in total, so there is essentially no existing breakpoint behaviour to preserve or conflict with.
- **(b) One place needs JavaScript, and it is justified by evidence, not preference.** Padding, columns, nav mode, and sheet-vs-dialog are all CSS. Only the calendar's structural split needs a mounted-layout decision, because rendering both and hiding one would put two dnd-kit draggables with identical ids in the DOM and make the shipped `e2e/calendar-dnd.e2e.ts` geometry assertions (`getByLabel(TILE).first()` then `boundingBox()`) resolve against a `display:none` copy (Research D4).
- **(c) Extract-then-add keeps the riskiest retention cheap to prove.** Moving the shipped grid into `WeekGrid.tsx` verbatim before the phone layout exists means FR-RS-013/SC-RS-007's drag-and-drop guarantee is a diff review, not a re-test of dnd-kit semantics.
- **(d) 42% of the token debt is retired by deletion.** `WeeklyCalendar` → `CalendarSlot` → `CalendarMealCard` and `MealSlotCard` are reachable only from their own tests (`CalendarPage` builds the grid inline), so 16 of 42 debt-carrying lines / 27 of 65 occurrences are dead code. Deleting them is strictly better than restyling them and is the difference between FR-RS-024 being a large chore and a small one (Research D8).
- **(e) Home needs no derivation logic of its own for two of four figures.** `InventoryContext` already exposes a server-computed `summary: {total, expired, expiringSoon}`, so "needs use soon" and "items tracked" are reads, not recomputations — eliminating the duplicate-derivation risk the spec's FR-RS-020 is guarding against (Research D6).
- **(f) The overlay retrofit is ordered by how much each already has.** `PurchasePromptSheet` already does sheet-vs-dialog and uses a token scrim; `EditItemSheet` and `MealDetailModal` already have Escape and dialog semantics. Only the focus trap, focus restoration and reduced motion are genuinely missing everywhere — so the primitive is small and each retrofit is a subtraction of duplicated markup (Research D5).
- **(g) No new dependency survives scrutiny.** A focus-trap library, a media-query hook library and a headless dialog library were each considered and rejected against what Tailwind 3.4 + React 18 + `lucide-react` already provide (Research D12).

## Risks & mitigations

- **`phland` losing the cascade to `sm:`** → a phone in landscape is typically 844×390, so its width also satisfies `sm` (≥640). Tailwind emits `raw` screens in config order, so `phland` is declared **last** in `extend.screens` and its utilities win at equal specificity. A Playwright assertion at 844×390 checks the *left* padding is 96px (rail-clearing) and not 34px (iPad portrait) — the exact value that proves ordering, not just that a class exists (Research D1).
- **`h-dvh` on the root breaking the existing pages** → several views set their own `min-h`/`max-w` (`GroceryListPage.tsx:233` `max-w-[720px]`, `FeedbackPage.tsx:15` `max-w-[640px]`, `InventoryPage.tsx:110` `min-[900px]:grid-cols-[1fr_400px]`). RS1 changes only the shell and leaves those in place so each screen keeps working; RS2/RS4 then adjust them per view. The `overflow:auto` region is introduced with a Playwright check that `document.body` has no scroll and `document.documentElement.scrollWidth === clientWidth` at all five viewports (SC-RS-001/002).
- **Nav rewrite churn vs. `nav.test.tsx`** → all 6 tests in `tests/app/nav.test.tsx` assert the literal labels `Kitchen`/`Meal plan`/`Groceries`/`Feedback`, and `e2e/redesign.e2e.ts:16-17` asserts `getByRole('link', {name:'Kitchen'})` and `'Groceries'`. Spec 010 supersedes `004` FR-UI-009, so these are **intentional** updates, not regressions; the tasks phase must update them in the same commit as the label change and must keep the `aria-current`, href and `kitchen-badge` assertions (which are behaviour, not labels).
- **Feedback leaves the nav but `/feedback` must stay reachable** → the design's nav has four items and no Feedback tab, while reconciliation item 16 requires the full `/feedback` surface to remain reachable. Resolved in Research D11: the quick-capture overlay carries an explicit "Open full feedback" link to `/feedback`, and the desktop sidebar keeps a secondary Feedback entry below the four primary items. `nav.test.tsx`'s href assertion is retargeted accordingly rather than deleted.
- **Step-to-zero: FR-RS-009 contradicts shipped code** → the spec's edge case says a quantity stepped to zero "remains visible… consistent with shipped behaviour", and the design gives a `neutral-400` dot for zero — but shipped code **deletes** the item at zero (`InventoryPage.tsx:88-95` calls `removeItem` and toasts "removed"; `InventoryList.tsx:9` documents "zero removes it"). FR-RS-009's "floors at zero" is therefore a *behaviour change*, not a retention. Research D10 decides: honour the spec (floor at zero, keep the row with a neutral dot, keep delete as the explicit destructive action), and flag it in `tasks.md` as the one place where spec 010 knowingly changes shipped behaviour so the reviewer sees it deliberately.
- **A hidden second calendar layout poisoning the e2e suite** → mitigated by construction (Research D4: exactly one layout mounts). `e2e/calendar-dnd.e2e.ts` runs on the desktop project and is treated as the guard: if a phone layout ever leaks into the desktop DOM, its `boundingBox()` step fails loudly rather than silently.
- **jsdom has no `matchMedia`** → any component calling the viewport hook throws in unit tests today. `tests/setup.ts` gains a `matchMedia` stub plus a `setViewport(cls)` helper in RS1, *before* the hook has any consumers, so no phase inherits a broken suite (Research D9).
- **Sidebar collapse flashing on load** → SSR cannot know `localStorage`, so the preference is applied in a mount effect against a design-default expanded sidebar. To avoid a visible *animated* collapse on every desktop load, the width transition is gated on a `data-nav-ready` attribute set after the first application, so a returning user sees "already collapsed" rather than a collapse animation (Research D3).
- **Home's `GET /grocery-lists/:weekStart` has a side effect** → spec `008` made GET recompute-on-view and lazily generate. Mounting `GroceryListProvider` on the Home route therefore triggers a rolling recompute on Home load. This is idempotent and identical to what visiting `/grocery` already does, and it is **not** an AI call, so SC-RS-005 is unaffected — but it is called out so nobody reads it as an accidental write.
- **Overlay retrofit touching four flows at once** → each retrofit is its own task with its own existing test file (`tests/components/grocery/PurchasePromptSheet.test.tsx`, `tests/components/inventory/EditItemSheet.test.tsx`, `tests/components/calendar/MealDetailModal.test.tsx`, `tests/components/consumption-review-sheet.test.tsx`), all of which assert behaviour rather than markup — so they stay green through the retrofit and are the proof that no flow regressed.
- **44px is broader than the stepper** → the audit surface is at least `QuantityStepper` (30×30, `:21`/`:32`), the edit/delete icon buttons (36×36, `InventoryList.tsx:100`/`:109`), the select checkbox (20×20, `:73`), the week-nav buttons (36×36, `CalendarPage.tsx:100`/`:108`), the pill nav items (~40px, `nav.tsx:46`) and the grocery Regenerate button (`GroceryListPage.tsx:244`). The tasks phase enumerates them rather than trusting the design's "audit the stepper specifically".

## Out of scope

Route renames to `/fridge`/`/plan`/`/list` (reconciliation item 17, deferred to a separate follow-up — and the point at which `/` should become Home); the recipe modal's numbered **Method** steps (reconciliation item 18 — the meal model has no step data); recipe photography and the `.washed` treatment; any API, schema, agent, prompt or cache change; `impl/vite` implementation (deferred by decision); release tagging and Portainer deployment.
