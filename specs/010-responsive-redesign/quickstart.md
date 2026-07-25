# Quickstart — "The Fridge" Responsive Redesign (`impl/nextjs`)

Dev/test walkthrough for spec 010. Prereqs: MongoDB + Holodeck (`docker compose up -d mongodb holodeck`), plus `packages/client/.env.local` with `MONGODB_URI`, `HOLODECK_URL`, `AUTH_MODE=dev`. `OPENAI_API_KEY` drives the agent; at least one of `BRAVE_SEARCH_API_KEY` / `SPOONACULAR_API_KEY` gives usable recipe links (FR-037). None of the AI keys are needed to exercise US1–US4 or US6 — only the Home banner CTA (US5) and the suggestions rails call the agent, and both are explicit-tap-only.

> Spec 010 is **presentation only**: no endpoint, no schema, no route rename (FR-RS-026). If any shipped flow behaves differently after this work — inventory edit/delete/expiry/select-mode, drag-and-drop on large viewports, cook/un-cook, immediate grocery purchase and reversal, rolling list scope, feedback chat/promote/pipeline — that is a **regression**, not a feature (SC-RS-007). The canonical values for every breakpoint, padding, colour, radius and copy string are in [`design/responsive-system.md`](design/responsive-system.md); `spec.md`'s *Alignment reconciliation* table is binding wherever the design and shipped behaviour disagree.

## Run it

```bash
npm run dev          # http://localhost:3000
```

### Exercising the five viewport classes locally

Use Chrome DevTools device toolbar (`⌘⇧M`) and set the viewport **by size, not by device preset** — FR-RS-001 forbids device sniffing, so only the dimensions matter:

| Viewport class | Set this size | What must be true (design §1.1/§1.3) |
| --- | --- | --- |
| Phone portrait | **390 × 844** | Bottom-centre floating **pill** nav; content padding top 54 / sides 16 / bottom 116; feedback **bubble** 56×56 at right 16 / bottom 96 |
| Phone landscape | **844 × 390** | Left-docked vertical **rail**, vertically centred; padding top 30 / **left 96** / right 16 / bottom 44; bubble 54×54 at right 16 / bottom 20 |
| iPad portrait | **820 × 1180** | Pill nav; padding top 40 / sides 34 / bottom 116; bubble 60×60 at right 26 / bottom 100 |
| iPad landscape | **1180 × 820** | Left **rail**; padding top 40 / **left 120** / right 34 / bottom 44; bubble 60×60 at right 24 / bottom 24 |
| Desktop | **1440 × 900** | Persistent left **sidebar** (250px expanded / 76px collapsed); padding top 32 / sides 40 / bottom 48; content capped at 1120px centred; feedback **`Tell us` pill** 54px high at right 32 / bottom 32 |

> **The 844 × 390 check is the important one.** Phone landscape is the only viewport class Tailwind cannot express with a stock breakpoint (it is width-*and*-orientation-*and*-height bound, research D1). At 844 wide, `sm:` (≥640) also matches, so the custom `phland` screen must win the cascade. Verify by inspecting the padded content wrapper: computed `padding-left` must be **96px**, not 34px. If it reads 34px, `phland` is not declared last in `tailwind.config.ts` → `extend.screens`.

### Per-story verification

**US1 — the shell and navigation (FR-RS-001..007)**

1. At each of the five sizes above, open all five screens (`/home`, `/`, `/calendar`, `/grocery`, `/feedback`). Navigation is present and in the mode the table says; the feedback affordance is present and never overlaps the nav (FR-RS-002/006).
2. **No horizontal page scroll anywhere** (SC-RS-001). Check in the console rather than by eye:
   `document.documentElement.scrollWidth === document.documentElement.clientWidth` → `true`.
3. **Only the content region scrolls** (FR-RS-004, SC-RS-002). Add enough inventory to overflow, then scroll: the nav and the feedback affordance must not move. Confirm `document.body` itself does not scroll — the scrollbar belongs to `<main>`.
4. **Wide content scrolls inside its own container** (FR-RS-007): at iPad landscape, the 7-day calendar grid scrolls horizontally *within its own box* while the page does not.
5. **Sidebar collapse persists** (FR-RS-003, SC-RS-009): at desktop, collapse the sidebar with the chevron (`aria-label="Toggle navigation"`), confirm items remain identifiable as icons, then **reload** — it is still collapsed, and it does not visibly animate closed on load. Check `localStorage.getItem('fp:nav:collapsed')`.
6. **Orientation change** from 390×844 to 844×390 while on any screen: nav switches pill → rail and content re-insets, with no horizontal overflow at either size.

**US2 — the fridge shelves (FR-RS-008..011)**

7. Seed items across all three locations, e.g. quick-add `2L milk expires friday`, `spinach exp 1d`, then use the edit sheet to move one item to `freezer` and one to `pantry`.
8. One shelf card per location — **Fridge / Freezer / Pantry** — each with its tint (design §4.2.3), its name, and an `N items` count; at the viewport's column count (1 / 2 / 3 per design §1.2). A location with no items shows a **zero count and an empty hint**, not nothing.
9. Step a quantity with `−`/`+`: it moves by that item's step, **floors at zero without deleting the row** (FR-RS-009 — see Gotchas: this is an intentional change from shipped behaviour), persists across reload, and a zero-quantity chip shows the neutral dot.
10. Status is distinguishable **by more than colour**: the expiring chip keeps its text expiry line alongside the dot (FR-RS-009).
11. Everything shipped still works (FR-RS-010): edit (expiry + location), delete, and `009` **select mode** → "Find recipes with selected".
12. Type free text in the add pill: the spec `005` **parse preview with correctable provenance chips** still appears beneath it (FR-RS-011). The pill is a visual change only.

**US3 — the calendar hybrid (FR-RS-012..015)**

13. At **390 × 844**: a seven-day strip with one day selected, that day's meals listed, a dot on days that contain meals, and — on an empty day — the prompt *"Nothing planned for this day yet…"* (FR-RS-012).
14. At **1180 × 820** and **1440 × 900**: the shipped 7×4 grid, and **drag a planned meal to another slot** — it moves and persists (FR-RS-013). Per-slot clearing still works.
15. Inspect the DOM at desktop: there must be **exactly one** calendar layout mounted — no hidden day strip (research D4). A duplicate would break `e2e/calendar-dnd.e2e.ts`.
16. Cooked vs planned meals are visually distinct, and cook / un-cook behave exactly as spec `006` shipped, including the grounded inventory-clamped review and the receipt-based un-cook (FR-RS-014).
17. On first load of `/calendar`, **zero** recommendation requests fire (Network tab: no `POST /recommendations`); suggestions appear only after the explicit CTA, in **both** layouts (FR-RS-015, SC-RS-005).

**US4 — grocery and checkout (FR-RS-016..019)**

18. With a partially-checked list: a **progress ring** shows checked-of-total alongside the figure, and category groups sit at the viewport's column count (FR-RS-016).
19. Tap a row → it toggles and **immediately** adds to the kitchen with a receipt; untick → **exact reversal**. The ambiguous-quantity `PurchasePromptSheet` still appears where it applies (FR-RS-017). Verify inventory changed on `/`.
20. The finish-shopping button's count equals the **receipt-less** rows — not the unchecked ones — and completing it adds/marks only those and **does not clear the list** (FR-RS-018). The design's "N = unchecked, then clear" model is rejected (reconciliation item 13).
21. The **week the list covers** is evident in the header/progress card, so a row dropping out at a day rollover reads as spec `008`'s rolling behaviour rather than a bug (FR-RS-019).

**US5 — Home (FR-RS-020..022)**

22. Open **`/home`** (net-new route; `/` is still the Kitchen — FR-RS-026 forbids renaming, research D6). Four figures: items needing use soon, meals planned this week, shopping progress, total items tracked. Cross-check each against `GET /api/v1/inventory`'s `summary` and the meal plan / grocery list (SC-RS-006).
23. **Zero AI requests on load** (FR-RS-021, SC-RS-005): the Network tab shows no `POST /recommendations` when Home mounts. The banner names the **soonest-expiring** item from already-fetched inventory.
24. Tap `Cook this →`: **exactly one** scoped `POST /recommendations` fires, with `ingredientItemIds` containing that item's id. This is the shipped `009` scoped path, reused.
25. The Tonight / Grocery run / Week affordances navigate to `/calendar` and `/grocery` (FR-RS-022).
26. With an empty inventory, empty meal plan and empty grocery list, each element shows a **calm empty state**, not a zero-filled or broken card, and the banner is replaced by its calm alternative.

**US6 — overlays and accessibility (FR-RS-023..025)**

27. Open each overlay at a touch size and at desktop: `EditItemSheet` (Kitchen → edit), `PurchasePromptSheet` (grocery → tick an ambiguous-quantity row), `MealDetailModal` (calendar → tap a planned meal), consumption review (→ **Mark cooked**), and the feedback quick-capture (bubble / `Tell us`). Each must be a **bottom sheet with a grab handle** on touch and a **centred dialog** on desktop (FR-RS-023).
28. Dismiss each by clicking the scrim **and** by pressing **Escape**; focus must return to the control that opened it (SC-RS-004).
29. With an overlay open, press `Tab` repeatedly: focus stays **inside** the panel and cycles.
30. Rotate (390×844 → 844×390) **with an overlay open**: presentation swaps sheet ↔ dialog without losing entered values or the trapped focus (spec edge case).
31. Trigger a toast (add an item): it is announced by assistive tech (`role="status"` / `aria-live="polite"`) and self-dismisses.
32. Keyboard-tab the whole app: every interactive element is a real control with an accessible name and a **terracotta focus outline** — never the default browser ring (`src/index.css:55-58`).
33. **44px audit** (FR-RS-025, SC-RS-003): measure the stepper `−`/`+`, the chip edit/delete buttons, the select-mode checkbox, the week-navigation chevrons, the pill nav items and the grocery Regenerate button. Every one ≥ 44px in **both** dimensions.
34. Enable **reduce motion** (macOS System Settings → Accessibility → Display → Reduce motion, or DevTools → Rendering → *Emulate CSS `prefers-reduced-motion`*): sheet slide-up, scrim fade and sidebar width transitions are all suppressed (FR-RS-025).
35. **Token audit** (FR-RS-024, SC-RS-008) — this must return **nothing**:

```bash
cd packages/client && grep -rEn --include='*.tsx' \
  'bg-white|text-white|border-white|bg-black|bg-cream|(bg|text|border|ring|from|to|fill|stroke|divide)-(gray|indigo|green|red|yellow|blue|slate|zinc|emerald|amber|orange|purple|pink)-[0-9]{2,3}' src/
```

Baseline before this feature: **9 files / 42 lines / 65 occurrences**. Four of those files (`WeeklyCalendar`, `CalendarSlot`, `CalendarMealCard`, `MealSlotCard` — 16 lines / 27 occurrences) are **dead code** reachable only from their own tests and are deleted rather than restyled (research D8).

## Test it

```bash
npm -w packages/client run test -- tests/hooks/useViewportClass.test.ts
npm -w packages/client run test -- tests/components/shared/Overlay.test.tsx
npm -w packages/client run test -- tests/app/nav.test.tsx
npm -w packages/client run test -- tests/views/HomePage.test.tsx
npm test                                      # full Vitest suite (coverage thresholds enforced)
npm -w packages/client run build               # next build — types + routes
npm -w packages/client run test:e2e            # Playwright, all projects
npm -w packages/client run test:e2e:run -- --project=phone-portrait   # one viewport class
bash scripts/validate-e2e.sh --no-agent        # deterministic API smoke (unchanged by this feature)
```

- **`matchMedia` must be stubbed before anything uses it** (research D9): jsdom ships no `window.matchMedia`, so `tests/setup.ts` gains the stub **and** a `setViewport(cls)` helper in RS1, before `useViewportClass()` has any consumer. Without it, every suite that renders `Nav` or `CalendarPage` throws `window.matchMedia is not a function`.
- **Unit-test per viewport class with `setViewport()`**: `setViewport('phone'); render(<CalendarPage/>)` → day strip; `setViewport('desktop')` → the 7×4 grid. The stub defaults to `'desktop'`, matching the hook's SSR default, so the other 60-odd existing test files are unaffected.
- **Playwright uses named viewport projects, not per-test `setViewportSize`** — a project sets the viewport *before first paint*, which is what the hook's mount effect reads; a mid-test resize tests the resize path instead. Only `e2e/responsive.e2e.ts` runs on all five projects; the existing 10 specs stay on `desktop` (1280×720 — already the `xl` desktop class). The one deliberate exception is the orientation-change-with-overlay-open case, which *is* a resize test.
- **New Playwright coverage is required, not optional** — CLAUDE.md §8: every new user-facing feature MUST add or extend Playwright coverage for its primary journey, and CI runs the suite on every push to `impl/nextjs`. `e2e/responsive.e2e.ts` covers: nav mode per viewport, `scrollWidth === clientWidth`, nav fixed while content scrolls, sidebar collapse + reload, day strip vs grid, sheet vs dialog, Escape + focus restoration, and the 844×390 `padding-left: 96px` assertion that proves the D1 cascade ordering.
- **Intentional test updates** (spec 010 supersedes `004` FR-UI-009 tab labels): `tests/app/nav.test.tsx` (labels `Kitchen`/`Meal plan`/`Groceries`/`Feedback` → `Home`/`Fridge`/`Plan`/`List`, plus new mode and persistence tests) and `e2e/redesign.e2e.ts:16-17`. Keep the `aria-current`, `href` and `kitchen-badge` assertions — those are behaviour, not labels.
- **Deleted with their subjects**: `tests/components/calendar/{WeeklyCalendar,CalendarMealCard,MealSlotCard}.test.tsx`.
- **Do not change `e2e/calendar-dnd.e2e.ts`.** Its `getByLabel(TILE).first()` + `boundingBox()` geometry is the guard for the one-layout rule (research D4): if a hidden phone layout ever leaks into the desktop DOM, this fails loudly instead of silently.
- **Overlay retrofit tests should stay green untouched**: `tests/components/inventory/EditItemSheet.test.tsx`, `tests/components/grocery/PurchasePromptSheet.test.tsx`, `tests/components/calendar/MealDetailModal.test.tsx`, `tests/components/consumption-review-sheet.test.tsx` all assert behaviour rather than markup — they are the proof that no flow regressed through RS6.

## Verification log

*(Per-task entries appended during implementation, mirroring specs 008/009 — baseline, per-phase TDD red→green notes, and full-gate runs.)*

## Release handoff

- [ ] Create release/version tag after review
- [ ] Build and push deployment images
- [ ] Redeploy through Portainer and verify production health checks
- [ ] Run post-deploy smoke validation against the deployed URL
- [ ] Verify all five viewport classes on real devices against the deployed URL (phone portrait/landscape, iPad portrait/landscape, desktop)
- [ ] Confirm no `004` file was edited — the superseded requirements are recorded in `spec.md` only (FR-RS-026, keeps `004` SC-UI-008 verifiable)
- [ ] Confirm zero API-surface diff under `packages/client/app/api/` (SC-RS-006)
- [ ] Queue the deferred route-rename follow-up (`/fridge`, `/plan`, `/list`, and `/` → Home)

## Gotchas

- **`phland` must be declared LAST** in `tailwind.config.ts` → `extend.screens`. A phone in landscape is ~844px wide, so `sm:` matches too; Tailwind emits `raw` screens in config order, and only last-declared wins at equal specificity. The 844×390 `padding-left: 96px` check is the assertion that catches this.
- **`extend.screens`, never `theme.screens`.** Replacing the screens map breaks the 7 responsive utilities already in the codebase (`sm:`, `lg:`, `min-[900px]:`).
- **`100dvh`, not `100vh`.** Mobile browser chrome makes `100vh` taller than the visible viewport, which pushes the nav below the fold on exactly the phones this feature is for. Tailwind 3.4 has `h-dvh` — no dependency needed.
- **`box-sizing: border-box` on the padded wrapper** is a requirement, not a nicety (design §1.4 note 2): without it the §1.3 padding adds to a `width:100%` box and causes the horizontal overflow SC-RS-001 measures.
- **Step-to-zero is the one intentional behaviour change.** Shipped code **deletes** the item at zero (`src/views/InventoryPage.tsx:87-95`; `InventoryList.tsx:9` documents "zero removes it"). FR-RS-009 says *floors at zero*, and the design specifies a zero-quantity dot state — so the row now stays and delete remains the explicit destructive action (research D10). The spec's edge-case parenthetical ("consistent with shipped behaviour") is mistaken about the current code; the requirement wins. Fix the stale `onStep` doc comment while you are there.
- **`bg-cream` does not exist.** There is no `cream` colour in `tailwind.config.ts` — the ground token is `bg` (`#f5ead8`) and the card token is `surface` (`#ebddc5`). `ConsumptionReviewSheet.tsx:31`'s `bg-cream/60` has been compiling to nothing since spec `006`. Replace with `bg-surface/60`; do **not** add a `cream` colour to the config (research D8).
- **Exactly one calendar layout mounts.** Rendering both and hiding one with CSS duplicates dnd-kit draggable ids and makes Playwright's `.first()` + `boundingBox()` resolve against a `display:none` node. Branch on `useViewportClass()` (research D4).
- **The overlay's sheet ↔ dialog swap is CSS-only, deliberately.** That is the one place *not* to branch on the viewport hook: a JS branch would remount the panel on rotation and lose both its state and its trapped focus, which the spec's orientation-change edge case forbids.
- **No nested overlays.** The consumption review is hoisted out of `MealDetailModal` up to `CalendarPage`, so only one overlay (and one focus trap) is ever open. Its spec `006` data contract — grounded clamped lines, read-only untracked ingredients, receipt-based un-cook with 409 on legacy entries — must not change.
- **UTC date handling stays as shipped.** `getWeekStart`/`getWeekDays` return UTC-midnight ISO strings and the calendar reads `getUTCDate()`/`getUTCDay()`. The handoff recommends local date parts (design §4.3 note); **do not apply it** — mixing conventions is what would introduce the off-by-one it warns about. The day strip consumes the same helpers as the grid.
- **Zero AI calls on load, on every screen** (SC-RS-005). Verify in the Network tab, not by eye. `RecommendationsPanel` has had no prefetch effect since `009` IR1 — do not add one back "to warm the cache" for Home's banner.
- **Home lives at `/home`; `/` stays the Kitchen.** Reassigning `/` would be a route rename, which FR-RS-026 forbids and reconciliation item 17 defers.
- **Mounting `GroceryListProvider` on Home triggers a rolling recompute** (spec `008` made `GET /grocery-lists/:weekStart` recompute-on-view and lazily generate). That is idempotent and identical to visiting `/grocery`, and it is not an AI call — but do not hoist the provider app-level, or the Kitchen and Calendar screens pay a request they never use.
- **Don't rebuild the nav.** The portrait pill already exists (`004` FR-UI-007) and the spec keeps it (reconciliation item 4). Extend `app/nav.tsx` — and keep the urgent-count badge (`data-testid="kitchen-badge"`), which the design does not show and SC-RS-007 protects.
- **Don't delete the `/feedback` route or its surface.** Chat, history, **Promote to development** and the pipeline view stay exactly as shipped; the overlay is *additive* quick-capture (reconciliation item 16). The route stays reachable from the overlay's "Open full feedback" link and the desktop sidebar's secondary entry (research D11).
- **Do not build the recipe modal's numbered Method steps.** The meal model carries description + verified URL only; steps are data that does not exist (reconciliation item 18).
- **No new npm dependency.** The focus trap is hand-rolled, the viewport hook is `matchMedia`, `dvh`/`raw` screens ship with Tailwind 3.4, and `lucide-react` already has every icon (research D12). Adding one should be an argued change, not a quiet drift.

### RS1 verification log (2026-07-26)

- **Baseline** (pre-RS1): lint clean; 64 files / 694 tests passing.
- **T003–T008 Foundational**: Tailwind `extend.screens` (`sm`/`min900`/`lg`/`xl` then `phland` **last**) + `maxWidth.content`; `matchMedia` stub + `setViewport()` in `tests/setup.ts`; `useViewportClass()`; **4 dead calendar components deleted** (`WeeklyCalendar`/`CalendarSlot`/`CalendarMealCard`/`MealSlotCard` + 3 test files) after proving `CalendarPage` never imported them.
  - ⚠ **Tailwind finding:** a `screens` map containing an object (the `phland` raw query) **disables arbitrary `min-[…]:`/`max-[…]:` variants build-wide**. The one shipped `min-[900px]:` utility (`InventoryPage`) was migrated to a named `min900:` screen. Use named screens only from here on.
- **T009–T016 RS1 shell**: `AppShell` (`h-dvh` flex column, `<main>` the only scroll container, nav/feedback as siblings outside it, one `box-border` padded wrapper carrying the §1.3 per-viewport padding); `layout.tsx`'s fixed `max-w-shell px-7` shell replaced; `Nav` extended to three modes (pill → rail → sidebar) with `localStorage` collapse behind a `data-nav-ready` gate; `FeedbackAffordance` per viewport.
  - **Deviation:** the design's **Home tab is deliberately omitted** until RS5 builds `/home` — RS1 ships standalone, and linking to a non-existent route would be a dead tab. `nav.tsx`/`nav.test.tsx` assert its absence; RS5 restores it.
- **Playwright (pulled forward from T063, scoped to RS1)**: five named viewport projects added; `responsive.e2e.ts` asserts nav mode + position per viewport, no horizontal page scroll on 3 screens, single-scroll-container, the **844×390 `padding-left: 96px`** `phland`-cascade proof, and desktop sidebar collapse + reload persistence. Project scoping verified: the pre-existing 22 tests still run **desktop-only** (they did not multiply ×5).
- **Results**: `npm run lint` clean · RS1 unit tests **28/28** (useViewportClass 4, AppShell 5, FeedbackAffordance 4, nav 15) · **Playwright 39 passed / 8 skipped** (skips are the intentional project guards) · `next build` clean.
- ⚠ **Full-suite note:** two full `npm test` runs showed 5 failures, **all `MongoNetworkTimeoutError`** in `tests/server/*` under load (machine load avg 8.3, lingering workers; run duration 409s vs the usual ~13s). The representative failure (`tests/server/quick-add.test.ts`) **passes in 1.74s in isolation**, and RS1 is frontend-only, so these are environmental flakes rather than regressions. Re-confirm on a quiet machine / in CI before the RS1 PR is marked ready.
