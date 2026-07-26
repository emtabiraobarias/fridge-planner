# Research — "The Fridge" Responsive Redesign (`impl/nextjs`)

Phase 0 output. All Technical Context unknowns resolved; decisions numbered for traceability from `tasks.md`. Grounded in the shipped code read for this plan: `app/layout.tsx`, `app/nav.tsx`, `app/providers.tsx`, `app/{page,calendar/page,grocery/page,feedback/page}.tsx`, `tailwind.config.ts`, `src/index.css`, `src/views/{InventoryPage,CalendarPage,GroceryListPage,FeedbackPage}.tsx`, `src/components/inventory/*`, `src/components/calendar/*`, `src/components/grocery/*`, `src/components/shared/{Toast,AuthBanner}.tsx`, `src/context/{Inventory,MealPlan,GroceryList,Toast}Context.tsx`, `src/lib/{date-utils,quick-parse}.ts`, `src/server/models/inventory-item.ts`, `tests/setup.ts`, `tests/app/nav.test.tsx`, `vitest.config.ts`, `playwright.config.ts`, and all 10 `e2e/*.e2e.ts` specs.

---

## D1 — Viewport classes are Tailwind `screens` additions; only phone landscape needs a `raw` query, declared last

**Decision**: Express the five viewport classes as Tailwind breakpoints via `theme.extend.screens` (extend, never replace — the app already uses `sm:`, `lg:` and `min-[900px]:`, which a replaced `screens` map would break). Four of the five need **no new configuration** because Tailwind's defaults already sit on the design's boundaries:

| Design viewport class (design §1.1) | Mechanism |
| --- | --- |
| Phone portrait `<640px` | unprefixed base (mobile-first, constitution §III) |
| iPad portrait `640–1023px` | `sm:` (640) — bounded above by `lg:` overriding it |
| iPad landscape `1024–1279px` | `lg:` (1024) — bounded above by `xl:` overriding it |
| Desktop `≥1280px` | `xl:` (1280) |
| Phone landscape `<900px` + landscape + short | **NEW** `phland: { raw: '(max-width: 899px) and (orientation: landscape) and (max-height: 500px)' }` |

Add `maxWidth.content: '1120px'` for the desktop content cap (design §1.3); leave `maxWidth.shell: 1160px` in place since `app/layout.tsx` is the only consumer and RS1 replaces its use. Put the five media-query strings in `src/lib/viewport.ts` as the single source shared by the Tailwind config's `phland` raw string, the `useViewportClass()` hook and the Playwright projects, so the three never drift.

**The ordering subtlety is the whole decision.** A phone in landscape is typically 844×390 — its width also satisfies `sm` (≥640) and can satisfy `lg`. Tailwind emits screen variants in **config order**, so `phland` must be declared **last** in `extend.screens` for `phland:pl-24` to beat `sm:px-[34px]` at equal specificity. This is asserted directly: a Playwright check at 844×390 reads the computed `padding-left` and requires `96px` (the rail-clearing value, design §1.3), which only passes if the ordering is right.

**Rationale**: CSS-only adaptation means zero hydration cost, zero JS on the critical path, and no device sniffing — FR-RS-001 explicitly forbids sniffing and a user-set device mode, and a media query is the only mechanism that is *definitionally* driven by viewport condition. Reusing the default `sm`/`lg`/`xl` names keeps the 7 responsive utilities already in the codebase working untouched and keeps the mental model standard for future contributors. Phone landscape genuinely cannot be a `min-width` breakpoint: it is the conjunction of a width ceiling, an orientation and a height ceiling, which is exactly what `raw` exists for — and it is the only place the plan departs from the constitution's `min-width` preference, for a reason the constitution's own "mobile-first" intent doesn't cover.

**Alternatives considered**: **Container queries** — rejected: the adaptations here are viewport-level (nav mode, page padding, whether the page fills the screen), not component-context-level, and `@container` would need a new PostCSS plugin or Tailwind 4. **Raw `@media` blocks in `index.css`** — rejected: it would split layout rules between CSS files and JSX classes, and `004`'s design system deliberately keeps component styling in Tailwind classes (design §10 forbids inline styles for the same reason). **A single `useViewport()` hook driving all layout via JS** — rejected: it makes every responsive rule a hydration risk and a re-render, and it would put five media queries' worth of behaviour behind React instead of the style engine. **Replacing `theme.screens` wholesale with five named classes** (`phone`, `phoneLand`, `ipad`, …) — rejected: it silently breaks the existing `sm:`/`lg:`/`min-[900px]:` utilities and forces a rename churn across files this feature otherwise doesn't touch.

---

## D2 — The shell is a component; one padded wrapper owns per-viewport padding; the content region is the only scroll container

**Decision**: Introduce `src/components/shell/AppShell.tsx` and reduce `app/layout.tsx` to fonts, providers and `<AppShell>{children}</AppShell>`. `AppShell` is:

- a root `div` that is `h-dvh` (Tailwind 3.4 supports `dvh`) and `flex flex-col overflow-hidden`;
- one `<main>` that is `flex-1 min-h-0 overflow-auto` — the **only** scrolling element;
- **one** padded wrapper inside `<main>` carrying the design §1.3 padding as breakpoint classes (`box-border` explicitly, per design §1.4 note 2) and the desktop `max-w-content mx-auto`;
- `<Nav />` and `<FeedbackAffordance />` as siblings of `<main>`, positioned against the root, i.e. **outside** the scroll container.

Today's shell (`app/layout.tsx:34-47`) does the opposite: `min-h-screen` lets the root grow to content height and the page body scrolls, with the nav `fixed`. Replacing `min-h-screen bg-bg pb-24` and the fixed `mx-auto max-w-shell px-7` is the change. The global brand header (`:36-44`) becomes `xl:hidden`, because the desktop sidebar carries the brand row (design §2.2) and two wordmarks on one screen is the duplication that would otherwise result.

**Rationale**: Both design §1.4 notes are labelled "requirements, not suggestions" because each was a real bug during design, and each maps to a success criterion: a root that grows to content height scrolls the nav away (FR-RS-004, SC-RS-002), and a `width:100%` box with padding and no `border-box` overflows horizontally (SC-RS-001). Putting the rules in a component rather than in `app/layout.tsx` matters concretely: `vitest.config.ts:29` **excludes `app/layout.tsx` from coverage**, so rules living there would be invisible to the test suite; `AppShell` under `src/` is covered and unit-testable. One padded wrapper rather than per-view padding means the design §1.3 table exists in exactly one place, so a wrong value is one fix — and it is what lets each view stay unaware of the landscape rail's left inset.

`fixed` positioning for the nav still works because the root no longer scrolls; but the nav being a *sibling outside* `<main>` is what makes it structurally impossible for it to scroll away, rather than merely unlikely.

**Alternatives considered**: **Keep `min-h-screen` + `fixed` nav and add `pb-*` per viewport** — rejected: it is today's approach, and it leaves the page body as the scroll container, which FR-RS-004 forbids and which is the source of the design's original bug. **`100vh` instead of `100dvh`** — rejected: mobile browser chrome makes `100vh` taller than the visible area, which would push the nav below the fold on exactly the phone viewports this feature exists for; `dvh` is available without a dependency. **Per-view padding wrappers** — rejected: five viewport values × five screens is 25 places to get wrong, and the landscape-rail inset would have to be repeated in each. **A CSS Grid shell (`grid-rows-[1fr_auto]`)** — rejected: the nav is an overlay in three of five modes (floating pill, floating rail) and only in-flow on desktop, so a flex column with positioned siblings expresses it more directly.

---

## D3 — One `Nav` component with three modes; collapse persisted in `localStorage`, applied in a mount effect

**Decision**: **Extend** `app/nav.tsx`, do not rebuild it and do not split it into three components. Keep the existing `TABS` array shape, `isActive()` (`:22-24`), `next/link` usage, and the urgent-count badge (`:54-63`, `data-testid="kitchen-badge"` — a shipped capability the design doesn't show and SC-RS-007 protects). Change: labels to **Home / Fridge / Plan / List** (superseding `004` FR-UI-009) against unchanged hrefs `/home`, `/`, `/calendar`, `/grocery` (FR-RS-026); item internals from the current icon-beside-label row (`flex items-center gap-[7px]`, `:46`) to the design's icon-over-label column for the pill (design §2.1) and back to a row for the sidebar (design §2.2); and three positional modes selected by breakpoint classes on one element tree:

- **pill** — `fixed bottom-[26px] left-1/2 -translate-x-1/2 flex-row`, active up to `lg`;
- **rail** — `lg:left-[22px] lg:top-1/2 lg:-translate-y-1/2 lg:flex-col` plus the same under `phland:`;
- **sidebar** — `xl:static xl:h-full xl:w-[250px] xl:flex-col xl:rounded-none xl:border-r`, in flow.

Collapse state: `useState(false)` (design default = expanded), read from `localStorage['fp:nav:collapsed']` in a **mount effect**, written on toggle. The width transition is gated behind a `data-nav-ready` attribute set in the same effect, so a returning user's sidebar renders already-narrow instead of animating closed on every load.

**Rationale**: One component keeps `isActive`, the badge and the tab list in a single place, so a nav change can't drift between modes — and the spec is explicit that the portrait pill *already exists* and is *kept* (reconciliation item 4), which makes extension the faithful reading. Three separate components would triplicate the tab array and the active-route logic for purely positional differences that CSS expresses natively. The mount-effect read is chosen over a lazy `useState(() => localStorage…)` initialiser because the sidebar's width is **rendered output**: a lazy initialiser would produce a genuine SSR/client hydration mismatch on every collapsed-preference load, whereas `AuthContext`'s existing lazy `sessionStorage` read (`src/context/AuthContext.tsx:118-121`) gets away with it precisely because the token isn't rendered. Escaping the visible collapse animation via `data-nav-ready` is what makes the mount-effect approach indistinguishable from a synchronous read in practice, at zero hydration risk.

**Alternatives considered**: **Separate `PillNav`/`RailNav`/`SidebarNav` components** — rejected: duplicated tab/active logic, three test files for one behaviour, and it would fork the badge. **A blocking inline `<script>` in `<head>` to stamp the collapsed class before paint** — rejected: it is the classic no-flash trick, but it puts layout state outside React for a preference whose worst-case cost is one frame, and `data-nav-ready` already removes the visible artefact. **Cookie-based persistence read on the server** — rejected: it would make every page dynamic to avoid a one-frame flash, trading FCP (constitution §IV) for cosmetics. **A `NavContext`** — rejected: nothing outside `Nav` needs the collapsed flag, and CLAUDE.md §14 plus the constitution both push back on state that doesn't need sharing.

---

## D4 — Calendar hybrid: exactly ONE layout is mounted, selected by `useViewportClass()`

**Decision**: `CalendarPage` renders **one** of two children, never both:

```
const vp = useViewportClass();                    // 'phone' | 'phone-landscape' | 'ipad-portrait' | 'ipad-landscape' | 'desktop'
const phone = vp === 'phone' || vp === 'phone-landscape';
… phone ? <><DayStrip …/><DayPlanList …/></> : <WeekGrid …/>
```

`CalendarPage` keeps ownership of everything behavioural — `handleDragEnd`, `placeInto`, `getEntry`, `shiftWeek`, `selectedEntry`, and the UTC helpers `dayNumber`/`dowIndex`/`todayUtcDate`/`rangeLabel` (`CalendarPage.tsx:26-42`) — and passes them down, so no meal-plan logic is duplicated. `WeekGrid.tsx` is the shipped grid (`:136-180`) **extracted verbatim**, including `DndContext`, the 6px `PointerSensor` activation constraint, `overflow-x-auto`, `min-w-[720px] grid-cols-7`, `PlannedMealTile` and `EmptySlotTarget`. `DayStrip`/`DayPlanList` are net-new and phone-only. Selected-day state lives in `CalendarPage` (the spec's second ephemeral state), defaulting to today when today is inside the visible week and to the week's first day otherwise.

`useViewportClass()` uses `window.matchMedia` with a `change` subscription, and is **hydration-safe by construction**: `useState` initialises to `'desktop'` (the same value the server renders), and the real class is applied in a mount effect. There is no `useSyncExternalStore` client/server snapshot divergence and no `suppressHydrationWarning`.

**Rationale**: Three independent pieces of evidence rule out render-both-and-toggle-with-CSS.

1. **dnd-kit id collision.** Both layouts would render draggables/droppables derived from the same `slotId`s. `@dnd-kit/core` keys its registry by id; two live registrations per id is undefined behaviour, and the hidden copy still mounts sensors and subscribes to the context.
2. **The shipped e2e suite would break in a way that looks like a product bug.** `e2e/calendar-dnd.e2e.ts` does `page.getByLabel(TILE).first()` then `boundingBox()` and throws `missing bounding boxes for drag` when the box is null. Playwright locators match `display:none` elements; `.first()` is DOM order, not visibility. A hidden phone tile appearing earlier in the DOM makes a green suite go red for reasons unrelated to drag-and-drop — and FR-RS-013 + SC-RS-007 make that suite the *proof* that drag-and-drop survived.
3. **The phone layout needs state the grid does not.** Selected-day is meaningless in the 7×4 grid. Mounting both means maintaining that state permanently and reasoning about whether it applies.

The SSR-default-`'desktop'` choice is deliberate: it matches the Playwright default viewport (Desktop Chrome, 1280×720 — exactly the `xl` desktop class), so the existing 10 specs see the grid in the very first painted HTML and need no `waitFor` added. On a phone the first paint is a grid for one frame — invisible in practice, because `MealPlanContext` resolves after mount and the grid's first paint is empty either way.

**Rationale for not adopting the handoff's date advice**: design §4.3's closing note recommends building day keys from local date parts. The app is UTC-anchored end to end — `getWeekStart`/`getWeekDays` (`src/lib/date-utils.ts`) return UTC-midnight ISO strings, `CalendarPage` reads `getUTCDate()`/`getUTCDay()`, and both quick-add and the edit sheet anchor at `T00:00:00.000Z` (`InventoryPage.tsx:61`, `EditItemSheet.tsx:49`). Mixing conventions in the new day strip is precisely the off-by-one the handoff was warning about. `DayStrip` therefore consumes the same `getWeekDays()` output and the same `dowIndex`/`dayNumber` helpers as the grid.

**Alternatives considered**: **Render both, `hidden lg:block` / `lg:hidden`** — rejected on all three grounds above. **Render both but wrap the inactive one in `aria-hidden` + `inert`** — rejected: it addresses the a11y tree but not the dnd-kit registry, and `inert` still leaves Playwright's non-role locators matching. **CSS-reflow the same 7×4 grid into a day strip** — rejected: the day strip is not a reflow, it is a filter (one day's meals) plus new state, i.e. behaviour. **`useSyncExternalStore` with `getServerSnapshot`** — rejected as unnecessary complexity for the same one-frame outcome the simpler effect gives. **Two separate routes for phone vs desktop calendars** — rejected: device-based routing is the sniffing FR-RS-001 forbids, and it would fork `/calendar`.

---

## D5 — One `Overlay` primitive with a hand-rolled focus trap; the cook flow is hoisted so no overlay nests

**Decision**: `src/components/shared/Overlay.tsx` with the API:

```
interface OverlayProps {
  open: boolean;
  onClose: () => void;
  titleId: string;                 // wired to aria-labelledby
  children: ReactNode;
  labelledTitle?: string;          // convenience when the caller has no heading of its own
}
```

Implementation: `createPortal` to `document.body`; scrim `bg-[color-mix(in_srgb,var(--color-neutral-900)_45%,transparent)]` with click-to-dismiss; **presentation by CSS only** — `items-end` + `rounded-t-[30px]` + grab handle on touch classes, `xl:items-center` + `xl:w-[min(460px,90%)]` + `xl:rounded-[28px]` on desktop; `role="dialog"`, `aria-modal="true"`, `aria-labelledby={titleId}`; Escape via a `keydown` listener; `useFocusTrap()` for trapping and restoration; `max-h-[88%] overflow-auto` for tall panels.

`useFocusTrap(active)` is **hand-rolled** (~30 lines): on activation it records `document.activeElement`, focuses the first tabbable node in the container, and installs a `keydown` handler that cycles `Tab`/`Shift+Tab` within a queried tabbable set; on deactivation it restores focus to the recorded element. No new dependency (D12).

**Retrofit order** — ascending by how much work each needs:

1. `PurchasePromptSheet` — already does sheet-vs-dialog (`:46` `grid place-items-end … sm:place-items-center`) and already uses a token scrim (`bg-ink/30`). Needs Escape, trap, restore. Lowest risk, so it validates the primitive.
2. `EditItemSheet` — already has `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape (`:35-40`) and scrim-click (`:58-60`). Needs sheet-on-touch, trap, restore, and its `bg-black/40` scrim (`:62`) re-tokened.
3. `MealDetailModal` — same ad-hoc shape (`:196-210`), plus the bulk of the token debt (18 lines / 25 occurrences) and a genuine a11y defect: `focus:outline-none` on the close button (`:214`) suppresses the visible focus indicator FR-RS-025 requires.
4. `ConsumptionReviewSheet` — **promoted** from an inline `<section>` (`:31`) to a standalone overlay, with its open state hoisted from `CookControls` (`MealDetailModal.tsx:115`) up to `CalendarPage`.

**Rationale for hoisting the cook flow**: today the consumption review renders *inside* `MealDetailModal`, so retrofitting both onto `Overlay` would create a nested modal — two focus traps, two Escape handlers, ambiguous restoration. Hoisting the open state to `CalendarPage` means the detail overlay closes as the consumption overlay opens: one overlay at a time, one trap, unambiguous restoration. It is also what the design requires anyway — design §4.3.4 puts **Mark cooked** directly on the phone day-list card, i.e. an opener that has no detail modal in the picture at all. The spec `006` contract is untouched by the move: `buildReviewLines`, the grounded/clamped lines, the read-only untracked names and `cookMeal`/`uncookMeal` all keep their current shapes and call sites (FR-RS-014).

**Rationale for CSS-only presentation**: the spec's edge case requires an orientation change while an overlay is open to swap sheet ↔ dialog "without losing its state or its trapped focus". A CSS-driven swap never unmounts the panel, so React state and the trap's recorded opener both survive for free. A JS-driven swap (`vp === 'desktop' ? <Dialog/> : <Sheet/>`) would remount and lose both — this is the one place the plan deliberately does *not* branch on the viewport hook.

**Alternatives considered**: **`<dialog>` element with `showModal()`** — tempting (native trap, native Escape, native backdrop) but rejected: the top-layer backdrop can't be styled with the design's `color-mix` scrim without `::backdrop` gymnastics, `showModal()` needs imperative ref calls that fight React's declarative `open` prop, and iOS Safari support for the pattern was uneven for the sheet presentation. **`focus-trap-react` / `@radix-ui/react-dialog` / `@headlessui/react`** — rejected in D12. **Retrofitting each overlay in place with shared classes but no shared component** — rejected: five copies of the trap and Escape logic is exactly the "three ad-hoc overlays with inconsistent treatment" state FR-RS-023 exists to end. **Keeping the consumption review nested and giving `Overlay` a nesting-aware trap stack** — rejected: real complexity for a case the design doesn't ask for and the hoist eliminates.

---

## D6 — Home lives at `/home`; all four figures come from contexts already mounted; the banner CTA reuses `009` scoping on tap

**Decision**:

**Route.** Home is a net-new segment at **`/home`**. `/` continues to render `InventoryPage` (the Kitchen). FR-RS-026 forbids renaming existing routes, and reassigning `/` to Home would rename the Kitchen route by definition. The spec's Assumptions anticipate this — "where Home physically lives is a per-branch plan decision consistent with FR-RS-026" — and the deferred rename follow-up (reconciliation item 17) is where `/` becomes Home and the Kitchen becomes `/fridge`.

**Data sources** — each figure is a read of state already in memory, not a new derivation:

| Home figure | Source | Why not something else |
| --- | --- | --- |
| Items needing use soon | `InventoryContext.summary.expiringSoon` | **Server-computed** (`src/server/controllers/inventory.ts:51,68`), exposed as `InventorySummary {total, expired, expiringSoon}` (`src/services/inventory.ts:19-23`) and already carried by the app-level provider. Re-deriving from `items` client-side would risk disagreeing with the server's midnight-cutoff rule in `lib/expiration.ts`. |
| Total items tracked | `InventoryContext.summary.total` | Same; also correct under pagination, which a `items.length` count would not be. |
| Meals planned this week | `MealPlanContext.plan.entries` | App-level provider (`app/providers.tsx:23`), already week-scoped by `currentWeekStart`. |
| Shopping progress | `GroceryListContext` — `items.filter(i => i.isPurchased).length` / `items.length` | This is the exact pair `GroceryListPage.tsx:139-141` already computes. Extracted into `src/lib/home-summary.ts` so Home and `GroceryListPage` share one implementation rather than two. |

**Provider placement.** `GroceryListProvider` is **not** hoisted to `app/providers.tsx`; it is mounted on the Home route only, exactly as `app/grocery/page.tsx:8-12` does. Hoisting it would fire `GET /grocery-lists/:weekStart` on the Kitchen and Calendar screens too, which need it for nothing. Note the side effect this accepts: spec `008` made that GET recompute-on-view and lazily generate, so visiting Home triggers a rolling recompute — idempotent, identical to visiting `/grocery`, and **not** an AI call, so SC-RS-005 is unaffected.

**Banner CTA (FR-RS-021).** `UseItUpBanner` names the soonest-expiring item from **already-fetched** inventory (a pure `soonestExpiring(items)` in `home-summary.ts`, reusing `daysLeft` from `src/lib/quick-parse.ts:397`). Its `Cook this →` action reuses the shipped `009` scoped path verbatim: render `RecommendationsPanel` on Home and pass `ingredientItemIds={[item._id]}` — the prop already exists (`RecommendationsPanel.tsx:22-31`) and the panel has had **no** prefetch effect since `009` IR1 (`:43-46`), so mounting it issues zero requests and the CTA issues exactly one. No new endpoint, no new context, no query parameter.

**Rationale**: FR-RS-020's binding constraint is "no new API endpoint or data model", and the reconciliation table records that all four counts are *already available*; the risk to manage is therefore duplicate derivation, not data access. Two of four figures are already server-computed summary fields, and the third and fourth are one-line reads — so `home-summary.ts` holds only the grocery pair, the soonest-expiring pick and the empty-state predicates, all pure and unit-tested. Keeping the CTA on Home rather than deep-linking into the Kitchen avoids `useSearchParams()`, which would force `/` out of static rendering and require a `Suspense` boundary — real cost for no user-visible gain, since results land in the app-level `RecommendationsProvider` and are therefore visible on the Kitchen screen anyway.

**Alternatives considered**: **Home at `/`, Kitchen moved to `/fridge`** — rejected: that is the deferred route rename, and it would churn ~27 navigation references across 10 e2e specs and the unit suite (reconciliation item 17). **A `GET /home-summary` aggregate endpoint** — rejected outright by FR-RS-026/SC-RS-006. **Deriving `expiringSoon` client-side from `items`** — rejected: duplicates the server's expiry rule and would drift from `lib/expiration.ts`'s midnight cutoff. **Hoisting `GroceryListProvider` app-level** — rejected: three screens pay a request they don't use. **CTA deep-links to `/?recipesFor=<id>`** — rejected: `useSearchParams` + `Suspense` + de-optimised static rendering for an outcome the on-Home panel already achieves. **Prefetching the recommendation so the banner can name a recipe like the handoff mock does** — rejected outright: `009` FR-IR-001 and FR-RS-021/SC-RS-005 forbid it; the handoff's "and it uses the whole bunch" copy is illustrative and must come from the on-tap call.

---

## D7 — Shelves group by the shipped `LOCATIONS` enum; `LocationFilter` is deleted; `InventoryList` is reused inside each shelf

**Decision**: Group by `LOCATIONS`, verified as exactly `['fridge','freezer','pantry'] as const` (`src/server/models/inventory-item.ts:9`) — a byte-for-byte match with the design's three shelves and their tints (Fridge → `accent2-100`, Freezer → `accent-100`, Pantry → `neutral-100`, design §4.2.3). Because the enum is known ahead of data, all three shelves render always, with a zero count and an empty hint rather than disappearing; a location value outside the set is grouped under a fallback shelf and never dropped (both spec edge cases). The client already has a local copy of the same list in `EditItemSheet.tsx:5` — the grouping order is taken from there or a shared client constant, never re-typed a third time.

**`LocationFilter` is deleted.** It is a segmented `All | Fridge | Freezer | Pantry` control (`LocationFilter.tsx:5`) whose entire purpose is showing one location at a time; shelves show every location at once, labelled. Keeping both would give the user two competing location models on one screen, and a filter that hides two of three shelf cards is a worse version of scrolling. Its `visibleCount`/`totalCount` readout moves onto the shelf headers as the design's `N items` count. `InventoryPage`'s `filter` state and the `visible` computation (`:103`) go with it.

**`InventoryList` is kept and reused**, rendered once per shelf with that shelf's items, rather than replaced by a bespoke chip list. It is where the shipped expiry line (`expiryText`, `:84-86`), edit button, delete button and `009` select-mode checkbox (`:67-75`) live, together with their RTL coverage — so reusing it is how FR-RS-010 and SC-RS-007 are honoured at near-zero risk. `ItemChip` is introduced as the design's compact chip presentation for the item row; `InventoryList`'s props and handler signatures do not change, so `InventoryPage`'s `handleStep`/`handleDelete`/`setEditing`/`toggleSelect` wiring is untouched.

**44px stepper.** `QuantityStepper`'s `−`/`+` are `h-[30px] w-[30px]` (`:21`, `:32`) — below the FR-RS-025 floor. They become 44×44 hit areas. The design's visual is a compact pill, so the *visual* control may stay small while the tappable area is padded out to 44px (`p-*` on the button with a smaller inner glyph, or `before:absolute` hit expansion) — the requirement is the touch target, not the ink. The same treatment applies to the other sub-44px controls enumerated in `plan.md` → Risks.

**Rationale**: The enum matching the design exactly is the reason shelf grouping is cheap and safe — there is no mapping table, no unknown-value policy to invent beyond the fallback, and no migration. Reusing `InventoryList` inverts the usual redesign risk: instead of reimplementing five shipped affordances inside a new chip component and hoping the tests still pass, the shipped renderer is placed inside the new container and its tests keep asserting the same behaviour.

**Alternatives considered**: **Keep `LocationFilter` alongside shelves** — rejected: two location models, and filtering to one shelf makes the spatial metaphor pointless. **Repurpose `LocationFilter` as a scroll-to-shelf jump bar** — rejected as unrequested scope; noted as a possible later nicety. **Group by `CATEGORIES` instead of location** — rejected: FR-RS-008 says storage location, and the grocery list already groups by category. **A new `ItemChip` that reimplements edit/delete/select from scratch** — rejected: it would fork five shipped affordances and orphan their tests. **Hard-code the three shelves in the view** — rejected: the enum is the source of truth, and a hard-coded list silently drops a future location.

---

## D8 — 42% of the token debt is dead code; delete it. The rest maps to Organic tokens 1:1

**Decision**: The FR-RS-024 debt is **9 files / 42 lines / 65 occurrences** (pattern: `bg-white`, `text-white`, `border-white`, `bg-black`, `bg-cream`, and any `{bg,text,border,ring,from,to,fill,stroke,divide}-{gray,indigo,green,red,yellow,blue,slate,zinc,emerald,amber,orange,purple,pink}-NNN` under `src/`):

| File | Lines | Occ. | Status |
| --- | --- | --- | --- |
| `src/components/calendar/MealDetailModal.tsx` | 18 | 25 | **live** — retrofit in RS6 |
| `src/components/calendar/WeeklyCalendar.tsx` | 6 | 8 | **DEAD → delete** |
| `src/components/calendar/CalendarMealCard.tsx` | 5 | 9 | **DEAD → delete** |
| `src/components/calendar/MealSlotCard.tsx` | 4 | 6 | **DEAD → delete** |
| `src/components/calendar/ConsumptionReviewSheet.tsx` | 4 | 4 | **live** — incl. the `bg-cream` defect |
| `src/components/shared/AuthBanner.tsx` | 2 | 6 | **live** |
| `src/components/calendar/CalendarSlot.tsx` | 1 | 4 | **DEAD → delete** |
| `src/components/feedback/PipelineStatusView.tsx` | 1 | 2 | **live** |
| `src/components/inventory/EditItemSheet.tsx` | 1 | 1 | **live** — `bg-black/40` scrim |

**Four components are dead code.** `CalendarPage` builds the week grid inline (`:136-180`); it never imports `WeeklyCalendar`. Reference tracing: `WeeklyCalendar` ← only `tests/components/calendar/WeeklyCalendar.test.tsx`; `CalendarSlot` ← only `WeeklyCalendar.tsx`; `CalendarMealCard` ← only `CalendarSlot.tsx` + two tests; `MealSlotCard` ← only its own test. The whole `WeeklyCalendar → CalendarSlot → CalendarMealCard` chain and `MealSlotCard` are reachable **only from tests**. Delete all four plus their three test files, retiring **16 lines / 27 occurrences** — 42% of the debt — with zero product risk. (`DraggableMealCard` is likewise test-only but carries no token debt; leave it to the tasks phase to decide, out of this FR's scope.)

**Mapping for the five live files** (design §7 is the authority; the Tailwind names below already exist in `tailwind.config.ts`):

| Raw class | Organic replacement | Note |
| --- | --- | --- |
| `bg-white` (panel) | `bg-bg` | `#f5ead8` app ground — the design's panel background (§5.1) |
| `bg-white` (inner field/inset) | `bg-surface` or `bg-neutral-100` | field vs card, per §4.4/§5.3 |
| `text-white` (on accent fill) | `text-bg` | the design's own convention: `--color-bg` is the text colour on accent fills (§7.1) |
| `bg-black/40` (scrim) | `bg-[color-mix(in_srgb,var(--color-neutral-900)_45%,transparent)]` or `bg-neutral-900/45` | design §5.1 scrim |
| `bg-cream` **(does not exist)** | `bg-surface` (`bg-cream/60` → `bg-surface/60`) | see below |
| `text-gray-{400,500,600}` | `text-muted` | the shipped utility (`src/index.css:71-73`) |
| `text-gray-{700,900}` | `text-ink` | |
| `bg-gray-{50,100}` / `border-gray-{200,300}` | `bg-neutral-{100,200}` / `border-divider` | |
| `bg-indigo-*` / `text-indigo-*` / `border-indigo-*` | `accent2-*` ramp | indigo was the pre-Organic "planned meal" voice; sage is its Organic counterpart (§7.1) |
| `bg-green-*` / `text-green-*` / `bg-emerald-*` / `text-emerald-*` | `accent2-{100,600,700,800}` | "cooked"/"fresh"/"success" voice (§7.1) |
| `bg-red-*` / `text-red-*` / `bg-yellow-*` / `text-yellow-*` / `bg-amber-*` / `text-amber-*` | `accent-{100,600,700,800}` | terracotta carries urgency in the Organic system |

**The `bg-cream` defect** (`ConsumptionReviewSheet.tsx:31`, `bg-cream/60`): `tailwind.config.ts` has **no `cream` colour** — the ground token is named `bg` (`#f5ead8`) and the card token `surface` (`#ebddc5`). `bg-cream/60` therefore compiles to nothing and the panel has been rendering transparent since spec `006` introduced it. It is a live `004` SC-UI-002 violation, is named in the spec's "latent defect" note, and SC-RS-008 requires the reference to be gone. Replacement: `bg-surface/60` (the intended inset-card effect on the `bg` ground).

**Rationale**: Deleting dead code is strictly better than restyling it — it satisfies the FR, shrinks the surface, removes three test files' worth of maintenance, and cannot regress anything because nothing imports it. The mapping is 1:1 and mechanical because the pre-Organic palette had exactly one role per hue (indigo = planned, green = success, red/amber = urgency, gray = text/borders), each of which the Organic system names explicitly.

**Alternatives considered**: **Keep the four dead components in case the grid is refactored back** — rejected: `git` is the archive, and dead code carrying token debt actively fails FR-RS-024/SC-RS-008. **Add a `cream` colour to Tailwind so `bg-cream` starts working** — rejected: it would invent a fourth ground token that `004`'s design system does not have and that design §7.1 contradicts; the class is the bug, not the config. **An ESLint rule banning raw colour classes** — attractive but out of scope; noted for a follow-up, since the grep in `quickstart.md` is the enforcement this feature needs.

---

## D9 — Test strategy: `matchMedia` stub in setup, Playwright viewport **projects**, behaviour-coupled assertions preserved

**Decision**, in three parts.

**(1) `tests/setup.ts` gains a `window.matchMedia` stub, in RS1, before any consumer exists.** jsdom implements no `matchMedia`, so the first component to call `useViewportClass()` would throw `window.matchMedia is not a function` across every suite that renders it — including `tests/app/nav.test.tsx`. The stub returns a `MediaQueryList`-shaped object driven by a module-level "current viewport class", plus an exported `setViewport(cls: ViewportClass)` helper (defaulting to `'desktop'`, matching the hook's SSR default so existing tests are unaffected). This makes per-viewport-class behaviour unit-testable — e.g. `setViewport('phone'); render(<CalendarPage/>); expect(screen.getByRole('tablist'))` for the day strip, and `setViewport('desktop')` for the grid.

**(2) Playwright uses named viewport projects, not per-test `setViewportSize`.** `playwright.config.ts` gains five projects — `phone-portrait` (390×844), `phone-landscape` (844×390), `ipad-portrait` (820×1180), `ipad-landscape` (1180×820), `desktop` (1440×900) — with `testMatch` scoping so **only** `responsive.e2e.ts` runs on all five and the existing 10 specs stay on `desktop` alone. The current single `chromium` project (Desktop Chrome, 1280×720) becomes the `desktop` project; note 1280 is exactly the `xl` desktop threshold, so today's specs already exercise the sidebar mode once RS1 lands.

Projects beat per-test `setViewportSize` here because a project sets the viewport **before first paint**, which is what `useViewportClass()`'s mount effect reads — a mid-test `setViewportSize` exercises the *resize* path instead of the *initial-render* path, and the initial render is what SC-RS-001/002 are about. Keeping the existing specs off the new projects also prevents a 10× runtime multiplication of a suite that has nothing viewport-specific to say. `e2e/quick-add.e2e.ts:41-44` already does a mid-test `setViewportSize` for its own purposes and is left alone; and `responsive.e2e.ts` additionally uses one explicit `setViewportSize` to cover the spec's orientation-change-with-an-overlay-open edge case, which is *by definition* a resize test.

**(3) Layout-coupled existing tests, and what happens to each.**

| Test | Coupling | Action |
| --- | --- | --- |
| `tests/app/nav.test.tsx` (6 tests) | Asserts literal labels `Kitchen`/`Meal plan`/`Groceries`/`Feedback` in 3 of 6 tests | **Rewrite labels** (spec 010 supersedes `004` FR-UI-009) and **add** mode + collapse-persistence tests. Keep the `aria-current`, `href` and `kitchen-badge` assertions — those are behaviour. |
| `e2e/redesign.e2e.ts:16-17` | `getByRole('link', {name:'Kitchen'})`, `'Groceries'` | Update to `Fridge` / `List` in the same commit as the label change. |
| `tests/components/calendar/{WeeklyCalendar,CalendarMealCard,MealSlotCard}.test.tsx` | Test dead components | **Delete** with their subjects (D8). |
| `tests/components/InventoryList.test.tsx:41` | `expect(row.className).toMatch(/accent-100/)` — asserts the expired-row tint | Keep, but re-point if the chip moves the tint. It is the only genuine class assertion in the unit suite, and it guards a token, so it stays meaningful. |
| `tests/components/grocery/GroceryListItemRow.test.tsx:46` | `className).toContain('line-through')` | Keep — strikethrough-on-checked is a design requirement (§4.4.3), so this is behaviour expressed as a class. |
| `e2e/calendar-dnd.e2e.ts` | `getByLabel(TILE).first()` + `boundingBox()` geometry | **Do not change.** It is the guard for D4's one-layout rule; if a hidden phone layout ever leaks in, this fails loudly. |
| `tests/components/{inventory/EditItemSheet,grocery/PurchasePromptSheet,calendar/MealDetailModal,consumption-review-sheet}.test.tsx` | Assert behaviour (open/close/confirm/values), not markup | Expected to stay green through the RS6 retrofit — they are the proof no flow regressed. |
| `tests/views/CalendarPage.test.tsx`, `tests/pages/GroceryListPage.test.tsx`, `tests/InventoryPage.test.tsx` | Query by role/label/text | Should survive; where a query breaks, it indicates a real affordance change and must be re-pointed, not deleted. |

**New Playwright coverage is mandatory, not optional**: CLAUDE.md §8 states every new user-facing feature MUST add or extend Playwright coverage for its primary journey, and that CI runs the full suite on every push to `impl/nextjs`. `e2e/responsive.e2e.ts` is therefore a deliverable of this feature, covering per viewport: nav mode and position, no horizontal page scroll (`documentElement.scrollWidth === clientWidth`), nav fixed while content scrolls, sidebar collapse + reload persistence, the phone day strip vs the desktop grid, sheet-vs-dialog presentation, Escape + focus restoration, and the 844×390 left-padding check that proves D1's cascade ordering.

**Alternatives considered**: **Per-test `page.setViewportSize()` throughout** — rejected: tests the resize path rather than initial render, and gives no way to run one spec across five viewports without a hand-rolled loop. **A single project with a `for (const vp of VIEWPORTS)` loop inside `responsive.e2e.ts`** — workable, but projects give per-viewport reporting, retries and selective runs (`--project=phone-portrait`) for free. **Running all 10 existing specs on all 5 projects** — rejected: ~5× CI time for near-zero signal; the desktop project already covers their behaviour. **Snapshot/visual-regression testing of the five viewports** — rejected: no dependency exists for it, screenshots are already captured for `004`'s SC-UI-006, and pixel baselines across five viewports would be a maintenance sink.

---

## D10 — Step-to-zero: honour FR-RS-009's floor, and record it as an intentional behaviour change

**Decision**: Implement FR-RS-009 as written — the stepper **floors at zero and the row remains**, rendering the design's `neutral-400` "quantity is 0" dot (design §4.2.3) — and keep the explicit delete button as the only way to remove an item. Flag this in `tasks.md` as the single place where spec 010 knowingly **changes** shipped behaviour rather than retaining it.

**The conflict is real and must not be glossed.** The spec's edge case reads: *"Quantity stepped to zero: the item remains visible and distinguishable, consistent with shipped behaviour (expired/zero items are never silently removed)."* The parenthetical is **incorrect about the shipped code**. `InventoryPage.handleStep` deletes at zero:

```
// src/views/InventoryPage.tsx:87-95
const next = applyStep(item.quantity, delta);
if (next === 0) { await removeItem(item._id); showToast(`${item.name} removed`); }
```

and `InventoryList`'s prop is documented `/** Apply a signed, unit-sized quantity delta to the item (zero removes it). */` (`:9`). `applyStep` itself already floors at zero (`src/lib/quick-parse.ts:443-445`) — the deletion is a deliberate decision in the view, not a side effect.

**Rationale**: The spec's *requirement* (FR-RS-009: "adjusts by that item's step, floors at zero, and persists") and the design's *visual* (a distinct dot state for zero quantity) both only make sense if a zero-quantity row exists — a design cannot specify the appearance of a state the app deletes on entry. Two independent statements of intent outrank one mistaken parenthetical about the current implementation. Deleting-at-zero is also a genuine usability hazard on a 44px touch target: one extra tap silently destroys an item and its expiry date, and the undo path is "re-add it from memory". Flooring is recoverable; deleting is not.

**Consequences the tasks phase must handle**: (a) the `${item.name} removed` toast no longer fires from the stepper — it remains on the delete button (`handleDelete`, `:97-101`); (b) `InventoryList`'s `onStep` doc comment must be corrected, since it is currently the only written record of the deleting behaviour; (c) any test asserting removal-at-zero must be re-pointed — a grep of `tests/InventoryPage.test.tsx` and `tests/components/InventoryList.test.tsx` for `removed`/`Decrease` currently finds **no such assertion**, so no existing test is expected to break, but the new floor-at-zero behaviour needs its own test citing FR-RS-009.

**Alternatives considered**: **Keep deleting at zero and treat the design's zero-dot as unreachable** — rejected: it silently drops FR-RS-009's "floors at zero" and leaves a specified visual state dead. **Delete at zero but show an Undo toast** (reusing `009`'s action-capable `ToastContext`) — a reasonable compromise, and cheap given the infrastructure exists, but rejected because FR-RS-009 says *floors*, not *confirms*, and the spec's edge case explicitly wants the item to remain visible. **Raise it as a spec tweak and pause** — rejected as disproportionate: the spec's requirement and its edge-case intent already agree with each other, so only a parenthetical description of existing code is wrong. It is recorded here and in `tasks.md` instead.

---

## D11 — Feedback: the affordance replaces the nav tab, and the tab's route stays reachable from two places

**Decision**: The nav's four items become **Home / Fridge / Plan / List** (design §2.1), so `Feedback` leaves the primary tab set. Reachability of the full `/feedback` surface — which reconciliation item 16 requires to be untouched (chat, history, **Promote to development**, pipeline status) — is preserved by two explicit paths:

1. the `QuickCaptureOverlay` carries an **"Open full feedback"** link to `/feedback`; and
2. the **desktop sidebar** keeps a secondary `Feedback` entry below the four primary items (the sidebar has the vertical room the pill does not; design §2.2 shows only the four primaries, so this is an addition made for reachability, not a design deviation of consequence).

`app/feedback/page.tsx`, `src/views/FeedbackPage.tsx` and every `src/components/feedback/*` component except the net-new overlay are untouched.

**Rationale**: This is a genuine gap between the design and shipped scope. The design's nav has exactly four items and treats feedback as a floating affordance; the shipped nav has a fifth tab pointing at a route that spec `003` + v4.8.0 built into a full surface with a promote action and a pipeline view. FR-RS-006 requires the affordance on every screen and viewport; reconciliation item 16 requires the route to remain; nothing requires the *tab*. Removing the tab while adding two explicit doors keeps both requirements true and keeps the design's four-item nav. The alternative — a fifth pill item — is what the design deliberately replaced, and it would make the pill wider than the design's geometry allows on a 320px phone.

**Consequence for tests**: `tests/app/nav.test.tsx`'s final test asserts `getByText('Feedback').closest('a')` has `href="/feedback"`. It is retargeted to the sidebar entry (rendered at the desktop viewport class via `setViewport('desktop')`) rather than deleted, so route reachability stays under test.

**Alternatives considered**: **Keep five pill tabs and add the bubble too** — rejected: two feedback entry points in the same viewport, and it breaks the design's nav geometry. **Drop the bubble on desktop since the sidebar has a Feedback entry** — rejected: FR-RS-006 requires the affordance on **every** viewport, and design §2.3 specifies the desktop `Tell us` pill explicitly. **Have the bubble navigate to `/feedback` instead of opening quick-capture** — rejected: reconciliation item 16 makes the overlay *additive quick-capture*; navigating would make it a duplicate nav link and lose the from-any-screen capture the design is after.

---

## D12 — Zero new npm dependencies; every candidate is rejected with its reason

**Decision**: **No new dependency.** The four things that might have justified one:

| Need | Rejected candidate | What is used instead |
| --- | --- | --- |
| Focus trap + restoration (FR-RS-023, SC-RS-004) | `focus-trap-react`, `@radix-ui/react-dialog`, `@headlessui/react` | Hand-rolled `useFocusTrap()` — record `document.activeElement`, focus the first tabbable, cycle `Tab`/`Shift+Tab` over a queried tabbable set, restore on close. ~30 lines, one file, unit-tested. |
| Viewport class detection (D4, one call site) | `react-responsive`, `usehooks-ts` | `window.matchMedia` + a `change` listener in `useViewportClass()`. ~20 lines. |
| Five viewport classes in CSS (D1) | `@tailwindcss/container-queries`, Tailwind 4 | `theme.extend.screens` including one `raw` query — already supported by `tailwindcss ^3.4.0`. |
| Icons (design §8) | any new icon set | `lucide-react ^0.400.0`, already a dependency, already exports every named glyph (`Home`, `Refrigerator`, `Calendar`, `ShoppingCart`, `MessageCircle`, `Sparkles`, `Clock`, `ChevronLeft`, `ChevronRight`, `Check`, `PanelLeft`). Design §8 explicitly says "use the codebase's `lucide-react` package, don't copy path data". |

**Rationale**: A dialog/focus-trap library is the only candidate with a serious case — trapping focus correctly across shadow roots, `inert` fallbacks and portals is genuinely fiddly. But the scope here is four overlays in one app with a known, simple DOM: no shadow DOM, no nested modals (eliminated by D5's hoist), no iframes. A headless-UI library would also bring its own styling and animation opinions into a design system that specifies every radius, duration and easing curve, and Radix/Headless UI would pull a multi-package dependency tree into a feature whose entire brief is presentational. `dvh` and arbitrary `screens` are already available on the installed Tailwind, and `lucide-react` already covers the icon set — so three of the four needs have no gap at all.

The bar this clears is deliberate: the plan's Summary, the Technical Context and this decision all state "no new npm dependency" so that adding one later is a visible, argued change rather than a quiet drift.

**Alternatives considered**: **`focus-trap-react` (~5kB)** — the closest call; rejected because it solves cases this app does not have, and the hand-rolled hook is testable in one file. **Vendoring a focus-trap implementation into `src/lib`** — same as hand-rolling but with someone else's edge cases; rejected. **Upgrading to Tailwind 4 for container queries** — rejected: a build-pipeline migration in a presentational feature, for a capability D1 shows is not needed.
