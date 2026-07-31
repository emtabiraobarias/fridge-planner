# Feature Specification: "The Fridge" Responsive Redesign

**Feature Branch**: `010-responsive-redesign`
**Created**: 2026-07-25
**Status**: Draft
**Input**: External design handoff ("The Fridge — responsive redesign", Claude Design) distilled per the roadmap's priority-backlog #8 (mobile/iPad UI+UX uplift): one responsive application across **five viewports** — phone portrait/landscape, iPad portrait/landscape, desktop — with a new **Home** dashboard, inventory presented as **spatial shelves**, viewport-adaptive **navigation**, a unified **sheet/dialog** overlay pattern, and an accessibility uplift.

> **Shared contract (both implementations).** Authored to be **topology-agnostic**: it defines *what* the responsive experience must look like and do — never *how* (framework, routing, CSS pipeline are per-branch `plan.md` concerns). Implementation proceeds on `impl/nextjs` first; `impl/vite` is **deferred by decision** and inherits this spec on the next `main` sync.
>
> **FR numbering:** `FR-RS-xxx` ("responsive"), to avoid collision with `001` `FR-0xx`, `002` `FR-D-xxx`, `003` `FR-F-xxx`, `004` `FR-UI-xxx`, `006` `FR-MC-xxx`, `007` `FR-GC-xxx`, `008` `FR-RG-xxx`, `009` `FR-IR-xxx`.
>
> **Self-contained design source.** Every breakpoint, padding value, colour, type step, radius, copy string, and per-screen visual spec needed to build this lives in [`design/responsive-system.md`](design/responsive-system.md). That file is the **canonical design reference**; the external handoff folder (`design_handoff_fridge_planner_responsive/`, never committed) may be deleted once this spec exists — exactly as spec `004` retired its own handoff.
>
> **Relationship to spec `004`.** This spec **supersedes named `004` requirements** rather than amending them, because `004`'s `SC-UI-008` ("no changes to the API contract, verifiable by diff") is a shipped, verified boundary that must stay true for `004`. Superseded: `FR-UI-009` (tab labels), `FR-UI-023`/`024`/`026` (calendar layout + placement) **on phone only**, `FR-UI-013`/`017`/`020` (Kitchen list treatment). Everything else in `004` — the Organic token system, quick-add, toasts, inline checkout — is **retained and extended**. `004`'s design system remains the source of colour/type truth.
>
> **Scope boundary.** Predominantly **frontend / presentation**. It adds **no new data model and no new API endpoint**: the new Home dashboard is composed entirely from data already returned by existing endpoints (see FR-RS-020). One net-new route (Home) and one net-new overlay entry point (feedback quick-capture) are introduced; **no existing route is renamed** (deferred by decision, see Clarifications).

---

## Alignment reconciliation *(mandatory reading — the handoff is not adopted wholesale)*

The handoff was authored against the repository but **predates or misreads five shipped features** (v4.4.0 → v4.8.0). Its README states it replaces a *"desktop-only UI that did not work on small screens"* — **that premise is overstated**: the floating bottom tab bar it proposes *already exists* (`004` FR-UI-007), the Kitchen two-column layout *already collapses* at narrow widths (`004` FR-UI-012), and the calendar grid is horizontally scrollable rather than broken. What **is** true — and is this spec's real justification — is that the app was **never designed responsively**: it carries only a handful of breakpoint utilities, a single fixed shell width, no orientation handling, no per-viewport spacing, and no landscape navigation.

Each design element is therefore classified **ADOPT** (build as designed), **ADAPT** (build, reconciled to shipped behaviour), or **REJECT** (shipped behaviour wins).

| # | Design element | Shipped reality | Resolution |
|---|---|---|---|
| 1 | Design tokens, type scale, radii, shadows | Identical to the app's Organic system | **ADOPT** verbatim (verified byte-identical) |
| 2 | Five-viewport breakpoints, column counts, per-viewport padding | Does not exist | **ADOPT** — the core of this spec |
| 3 | Viewport-filling root, content region as the *only* scroll container | Not enforced | **ADOPT** (FR-RS-004) |
| 4 | Nav: portrait pill / landscape rail / desktop sidebar | Portrait pill exists; other two do not | **ADOPT** the two new modes; keep the existing pill |
| 5 | Unified sheet-on-touch / dialog-on-desktop overlay pattern | Three ad-hoc overlays with inconsistent treatment | **ADOPT** as a shared primitive, retrofit the three |
| 6 | Accessibility punch list (real buttons, focus trap, `aria-live`, 44px targets) | Mostly satisfied; focus trap, live-region toasts and some touch targets are genuinely missing | **ADOPT** the genuine gaps |
| 7 | Home dashboard with four derived stat counts | Area does not exist; **all four counts already available** from existing endpoints | **ADOPT** (net-new area, no new endpoint) |
| 8 | "Use it up first" banner recommending a recipe **on load** | `009` FR-IR-001 forbids automatic recommendation calls | **ADAPT** — banner names the expiring item from existing data; the recipe CTA opens *scoped* recommendations on tap (no call on load) |
| 9 | Fridge as shelves grouped by storage location, editable chips | Kitchen groups as a flat list with expiry line, delete, edit sheet, and `009` select mode | **ADAPT** — adopt shelf grouping and the stepper chip, but **retain** expiry display, delete, the edit sheet (`004` FR-UI-019R) and select mode (`009` FR-IR-006) |
| 10 | Natural-language add pill (README: "decorative — wire the input") | `005` shipped a full parser with tap-to-correct provenance chips, alias memory and AI assist | **ADAPT** — adopt the pill's visual treatment; **retain** the entire shipped parse-preview UX beneath it |
| 11 | Day strip + single-day list replacing the 7×4 calendar grid | `001` FR-022 drag-rearrange, `004` FR-UI-023 grid, tap-to-place, per-slot clear | **ADAPT** — **responsive hybrid**: day strip on phone, 7×4 grid with drag-and-drop retained on iPad/desktop |
| 12 | "Mark cooked" consumption modal | `006` shipped cook-time consumption with a grounded, inventory-clamped review sheet | **ADAPT** — adopt the superior *visual* treatment; **retain** the shipped data contract (grounded lines, read-only untracked ingredients, receipt-based un-cook) |
| 13 | Grocery "Done shopping — move N into my kitchen" where **N = unchecked**, then **clear the list** | `007` shipped: ticking a row adds to inventory **immediately** with a receipt; checkout handles only **receipt-less** rows and never clears | **REJECT** the design's model. `N` = receipt-less count; no list clearing. The README's open question ("unchecked or checked?") is already answered by shipped code |
| 14 | Grocery list as a static category list | `008` shipped rolling, date-scoped recompute with day-anchored shed | **ADAPT** — adopt the visual treatment; **retain** rolling semantics and surface the week context so a shed row does not read as a bug |
| 15 | Suggestions as an always-present static array with `+ Place` auto-slotting | `009` shipped manual-only recommendations, empty-state CTA, two scoped entry points | **REJECT** auto-loading. **Retain** the explicit CTA, empty state and ingredient scoping; adopt the card treatment |
| 16 | Feedback as an overlay replacing the `/feedback` route | `003` + v4.8.0 shipped a multi-turn chat, record history, **Promote to development**, and the **pipeline status view** | **ADAPT** — overlay becomes **quick-capture** from any screen; `/feedback` **remains** the full surface (chat, history, promote, pipeline) |
| 17 | Route renames (`/fridge`, `/plan`, `/list`) | ~27 navigation references across 10 e2e specs and unit tests | **DEFER** — out of scope here; queued as a separate follow-up |
| 18 | Recipe modal with numbered **Method** steps | The meal model carries description + verified URL only — cooking steps are **data that does not exist** | **REJECT** for now — out of scope; the modal shows what the model actually has |
| 19 | Device bezels, prototype runtime, inline styles | — | **REJECT** (explicitly mockup-only per the handoff itself) |

**Latent defect found during alignment, folded into this spec (FR-RS-024):** five calendar/consumption components are off the Organic token set (raw `bg-white` / `text-gray-*` / `bg-indigo-*` etc.), and one references a Tailwind class (`bg-cream`) **that does not exist in the config** — a live `004` SC-UI-002 violation introduced later by `006`. The handoff's overlay and cook-modal specs are the natural vehicle for retiring it.

## Clarifications

### Session 2026-07-25 (design hand-off reconciliation, decisions FIXED)

- Q: Calendar — adopt the day strip, or keep the 7×4 grid? → A: **Responsive hybrid** — day strip + single-day list on phone; the 7×4 grid with drag-and-drop retained on iPad and desktop.
- Q: Feedback — overlay replacing the route, or both? → A: **Keep the route and add the overlay** — overlay is quick-capture; `/feedback` keeps chat, history, Promote and the pipeline status view (nothing shipped is lost).
- Q: Home banner — allow a recommendation call on load? → A: **No call until tapped** — the banner names the soonest-expiring item from existing data; its CTA opens scoped recommendations.
- Q: Route renames now? → A: **Defer** — keep current routes in this spec; queue the rename separately so responsive work is not gated on test churn.
- **Pre-answered by shipped code (recorded, not re-litigated):** the grocery checkout count is the **receipt-less** count and checkout **never clears the list** (`007` FR-GC-011).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The app fits my phone, my iPad, and my desktop (Priority: P1)

A user opens Fridge Planner on a phone held upright: navigation is a floating pill at the bottom, content is comfortably padded and never scrolls sideways, and the nav stays put while the page scrolls. Turning the phone sideways, the nav becomes a slim vertical rail docked to the left so it doesn't eat the short screen. On an iPad the same screens get roomier padding and more columns. On a desktop the nav becomes a persistent left sidebar the user can collapse to icons — and that choice is remembered.

**Why this priority**: This is the entire request. It is the foundation every other story renders inside, and it delivers value alone — the existing four screens immediately become usable on the devices people actually hold.

**Independent Test**: Load each screen at phone portrait, phone landscape, iPad portrait, iPad landscape and desktop widths. Navigation is present and correctly positioned in each; no horizontal page scroll occurs; the nav never scrolls out of view; the desktop sidebar collapses and the preference survives a reload.

**Acceptance Scenarios**:

1. **Given** a phone-portrait viewport, **When** any screen is opened, **Then** navigation appears as a floating horizontal pill at bottom-centre and the feedback affordance as a round bubble at bottom-right above it.
2. **Given** a landscape viewport on a short screen, **When** any screen is opened, **Then** navigation is a floating vertical rail docked left and vertically centred, and content is inset from the left so the rail never overlaps it.
3. **Given** a desktop viewport, **When** any screen is opened, **Then** navigation is a persistent left sidebar with labelled items, collapsible to an icon rail, and the feedback affordance is a labelled pill at bottom-right.
4. **Given** the desktop sidebar has been collapsed, **When** the user reloads, **Then** it is still collapsed.
5. **Given** a page whose content exceeds the viewport, **When** the user scrolls, **Then** only the content region scrolls — navigation and the feedback affordance remain fixed.
6. **Given** any supported viewport, **When** any screen is rendered, **Then** the page body never scrolls horizontally.

---

### User Story 2 - The fridge shows me where things actually live (Priority: P2)

Instead of one long list, the user sees their kitchen as shelves — Fridge, Freezer, Pantry — each a tinted card holding chips for the items on it, with a count. Each chip shows the item, whether it needs using soon, and a stepper to correct the quantity in one tap. Everything they can do today — see expiry, edit an item, delete it, select items for a recipe search — still works.

**Why this priority**: The Kitchen is the app's most-used screen and the flat list scales worst on a phone. Grouping by physical location is the handoff's strongest idea and directly serves the "what do I have" question.

**Independent Test**: With items across all three locations, open the Kitchen: one shelf card per location with correct counts and tinted backgrounds; stepping a quantity persists; expiry status is visible; edit, delete and select-mode all still function.

**Acceptance Scenarios**:

1. **Given** items in fridge, freezer and pantry, **When** the Kitchen is opened, **Then** one shelf card per location is shown with that location's items and an item count, at the column count for the viewport.
2. **Given** an item chip, **When** the user taps increase or decrease, **Then** the quantity changes by that item's step, never below zero, and the change persists.
3. **Given** an item expiring soon, **When** its chip is rendered, **Then** its status is distinguishable by more than colour alone, and expiry information remains available.
4. **Given** the shipped edit, delete and select-for-recipe-search affordances, **When** the redesigned Kitchen is used, **Then** all of them are still reachable.
5. **Given** the natural-language add field, **When** the user types free text, **Then** the shipped parse preview with correctable provenance chips still appears.

---

### User Story 3 - My week reads well on every screen (Priority: P3)

On a phone the user gets a compact seven-day strip; tapping a day shows just that day's meals, with an empty-state prompt when nothing is planned. On an iPad or desktop they keep the full week grid they have today, including dragging a meal to a different slot. Suggestions appear only when asked for, and can be scoped to chosen ingredients.

**Why this priority**: The calendar is the worst-performing screen on a phone today, but the week grid is genuinely better on large screens — so this story is explicitly a hybrid rather than a replacement.

**Independent Test**: At phone width, a day strip with a selected day and that day's meals; at iPad/desktop width, the seven-day grid with drag-and-drop intact. Suggestions are absent until requested, in both layouts.

**Acceptance Scenarios**:

1. **Given** a phone viewport, **When** the meal plan is opened, **Then** a seven-day strip is shown with one day selected, that day's planned meals listed, and days containing meals visually marked.
2. **Given** a phone viewport and a selected day with no meals, **When** it is displayed, **Then** an empty-state prompt invites adding one from suggestions.
3. **Given** an iPad or desktop viewport, **When** the meal plan is opened, **Then** the seven-day grid is shown and a planned meal can still be dragged to another slot.
4. **Given** either layout, **When** the meal plan first loads, **Then** no recommendation request is made and suggestions show an explicit call to action.
5. **Given** a cooked meal, **When** it is displayed, **Then** it is visually distinguished from a planned meal, and the shipped cook and un-cook behaviour is unchanged.

---

### User Story 4 - Shopping and checkout feel right on a phone (Priority: P4)

The grocery list shows progress as a ring — how many items are in the trolley — and groups items by category in as many columns as the screen allows. Tapping a row toggles it, which immediately adds it to the kitchen as it does today. The finish-shopping action reflects only the items not yet added.

**Why this priority**: The grocery list is used while standing in a shop, one-handed, so it benefits most from touch treatment — but the underlying purchase semantics shipped recently and must not regress.

**Independent Test**: With a partially-checked list, the ring and counts match; toggling a row adds/reverses inventory as shipped; the finish action's count equals the not-yet-added rows; finishing does not clear the list.

**Acceptance Scenarios**:

1. **Given** a list with some items in the trolley, **When** it is opened, **Then** a progress ring shows checked-of-total and categories are grouped at the viewport's column count.
2. **Given** an item row, **When** the user taps it, **Then** it toggles and the shipped immediate add-to-kitchen (and exact reversal on un-tick) behaviour applies unchanged.
3. **Given** rows already added to the kitchen and rows not yet added, **When** the finish-shopping action is displayed, **Then** its count reflects only the rows **not yet added**.
4. **Given** the user finishes shopping, **When** it completes, **Then** remaining rows are added and marked, and the list is **not** cleared.
5. **Given** the list is rolling and date-scoped, **When** it is displayed, **Then** the week it covers is evident, so a row dropping out at a day rollover is understandable rather than surprising.

---

### User Story 5 - One screen answers "what now?" (Priority: P5)

A new Home screen opens with the date and a plain-language summary: how many items need using soon, how many meals are planned, shopping progress, and how many items are tracked. Below, a highlighted banner names the single thing most worth cooking today — the soonest-expiring item — with an action to find recipes for it. Then three cards: tonight's meal, grocery progress, and a few fresh items.

**Why this priority**: Genuinely new value — it answers the product's core question at a glance — but it depends on the shell (US1) and is additive, so it ships after the existing screens are right.

**Independent Test**: Open Home with known data: the four counts match the underlying data, the banner names the correct soonest-expiring item, the cards link to the right screens, and **no recommendation request is made on load**.

**Acceptance Scenarios**:

1. **Given** existing inventory, meal-plan and grocery data, **When** Home is opened, **Then** four summary figures are shown — items needing use soon, meals planned this week, shopping progress, and total items tracked — each derived from that data.
2. **Given** at least one item expiring soon, **When** Home is opened, **Then** a banner names the soonest-expiring item and offers an action to find recipes that use it.
3. **Given** Home is opened, **When** it loads, **Then** **no** recommendation/AI request is issued; the banner's action issues one only when tapped.
4. **Given** the summary cards, **When** the user activates the tonight, grocery or week affordances, **Then** they navigate to the meal plan or grocery list accordingly.
5. **Given** empty inventory, meal plan or grocery list, **When** Home is opened, **Then** each element shows a sensible empty state rather than a zero-filled or broken card.

---

### User Story 6 - Overlays and interactions are consistent and accessible (Priority: P6)

Every overlay behaves the same way: on touch it rises from the bottom as a sheet with a grab handle; on desktop it fades in centred. They can be dismissed by tapping outside or pressing Escape, keyboard focus is trapped inside while open and returns to where it started on close. Toasts announce themselves to assistive technology. Every control is a real button with an accessible name and a large enough touch target.

**Why this priority**: Cross-cutting polish and correctness. It is last because it retrofits surfaces the earlier stories create, but it carries the accessibility commitments and retires visual debt.

**Independent Test**: Open each overlay on touch and desktop widths; verify sheet-vs-dialog presentation, outside-click and Escape dismissal, focus trapping and restoration; verify toasts are announced; audit controls for accessible names and touch-target size.

**Acceptance Scenarios**:

1. **Given** a touch viewport, **When** any overlay opens, **Then** it presents as a bottom sheet with a grab handle; on a desktop viewport the same overlay presents as a centred dialog.
2. **Given** an open overlay, **When** the user taps the scrim or presses Escape, **Then** it closes and focus returns to the control that opened it.
3. **Given** an open overlay, **When** the user cycles focus with the keyboard, **Then** focus remains within the overlay.
4. **Given** an action that produces a toast, **When** it fires, **Then** the message is announced to assistive technology and dismisses itself.
5. **Given** any interactive control, **When** inspected, **Then** it is a real control with an accessible name, a visible focus indicator, and a touch target of at least 44px in each dimension.
6. **Given** a user who prefers reduced motion, **When** overlays and transitions occur, **Then** animation is suppressed.

---

### Edge Cases

- **Orientation change while an overlay is open**: the overlay switches presentation (sheet ↔ dialog) without losing its state or its trapped focus.
- **Very short landscape viewports** (phone landscape): vertical space is scarce — headers compress and the left rail must not overlap content.
- **A shelf with no items**: the shelf card shows a zero count and an empty hint rather than disappearing (locations are known ahead of data).
- **A location value outside the known set**: items still render, grouped under a fallback shelf, never dropped.
- **Home with no expiring item**: the banner is replaced by a calm alternative rather than showing an empty highlight.
- **Quantity stepped to zero**: the item **remains visible** with a distinct zero state rather than disappearing. ⚠ This is an **intentional change** from shipped behaviour, where stepping to zero deletes the item and toasts "removed" — correcting an inaccurate claim in an earlier draft of this spec. The design requires a zero-quantity indicator state, so the row must survive; deletion remains available as its own explicit action (FR-RS-009/010).
- **Desktop narrower than the content maximum**: content fills available width and stays centred without horizontal overflow.
- **A day rollover while the grocery list is open**: the next recompute may drop rows; the week context makes this legible.

## Requirements *(mandatory)*

### Functional Requirements

**Responsive shell & navigation (US1)**

- **FR-RS-001**: The application MUST present a single responsive experience across five viewport classes — phone portrait, phone landscape, iPad portrait, iPad landscape, desktop — driven by viewport conditions, never by device sniffing or a user-set device mode.
- **FR-RS-002**: Navigation MUST adapt by viewport: a floating horizontal pill at bottom-centre in portrait; a floating vertical rail docked left and vertically centred in landscape; a persistent, collapsible left sidebar on desktop.
- **FR-RS-003**: The desktop sidebar MUST be collapsible to an icon-only rail, each item remaining identifiable when collapsed, and the collapsed/expanded preference MUST persist across sessions.
- **FR-RS-004**: The application root MUST fill the viewport with the content region as the **only** scroll container, so navigation and the feedback affordance never scroll out of view.
- **FR-RS-005**: Content MUST use the per-viewport padding and column counts defined in `design/responsive-system.md`, including insetting content away from the landscape rail, and MUST NOT produce horizontal page scrolling at any supported width.
- **FR-RS-006**: A feedback affordance MUST be present on every screen and viewport — a round bubble on touch viewports, a labelled pill on desktop — positioned so it never obscures navigation.
- **FR-RS-007**: Wide content (tables, grids, code) MUST scroll within its own container rather than the page body.

**The Fridge — spatial inventory (US2)**

- **FR-RS-008**: Inventory MUST be presented as one shelf card per storage location, each showing the location name, an item count, and that location's items, laid out at the viewport's column count.
- **FR-RS-009**: Each item MUST render as a chip carrying its name, a status indicator distinguishable by more than colour alone, and a quantity stepper that adjusts by that item's step, **floors at zero without deleting the item**, and persists. *(Deliberate change from shipped behaviour, which deletes at zero — see Edge Cases. Deletion stays available as an explicit action per FR-RS-010.)*
- **FR-RS-010**: The redesigned Kitchen MUST retain all shipped inventory capabilities: expiry visibility, item edit (including expiry and location), delete, and ingredient selection for scoped recipe search.
- **FR-RS-011**: The natural-language add field MUST retain the shipped parse behaviour and its correctable preview, adopting only the field's visual treatment.

**Meal plan — responsive hybrid (US3)**

- **FR-RS-012**: On phone viewports the meal plan MUST present a seven-day strip with a selected day, that day's planned meals, an indicator on days containing meals, and an empty-state prompt for an empty day.
- **FR-RS-013**: On iPad and desktop viewports the meal plan MUST retain the seven-day × slot grid **including drag-and-drop rearrangement** and per-slot clearing.
- **FR-RS-014**: Planned and cooked meals MUST be visually distinct, and the shipped cook confirmation and un-cook behaviour (including its grounded, inventory-clamped review and receipt semantics) MUST be preserved unchanged.
- **FR-RS-015**: Suggestions MUST NOT load automatically on any viewport: an explicit call to action and an empty state are required, and ingredient-scoped requests MUST remain available.

**Grocery list (US4)**

- **FR-RS-016**: The grocery list MUST show shopping progress as a ring or equivalent non-numeric-only indicator alongside a checked-of-total figure, with categories grouped at the viewport's column count.
- **FR-RS-017**: Toggling an item MUST preserve the shipped purchase semantics exactly — immediate add to the kitchen on check, exact reversal on uncheck, including the ambiguous-quantity confirmation where it applies.
- **FR-RS-018**: The finish-shopping action's count MUST reflect only the rows **not already added to the kitchen**, completing MUST add and mark only those rows, and it MUST NOT clear the list.
- **FR-RS-019**: The list MUST make the week it covers evident, so rolling date-scoped changes are legible to the user.

**Home dashboard (US5)**

- **FR-RS-020**: A Home screen MUST present four figures derived from existing data — items needing use soon, meals planned this week, shopping progress, and total items tracked — with **no new API endpoint or data model**.
- **FR-RS-021**: Home MUST highlight the soonest-expiring item with an action to find recipes using it, and MUST NOT issue any recommendation/AI request on load; such a request occurs only on explicit activation.
- **FR-RS-022**: Home MUST offer navigation into the meal plan and grocery list from its summary cards, and MUST show sensible empty states when the underlying data is absent.

**Overlays, accessibility & visual debt (US6)**

- **FR-RS-023**: All overlays MUST share one pattern — bottom sheet with a grab handle on touch viewports, centred dialog on desktop — with a dismissing scrim, Escape-to-close, focus trapped while open, focus restored on close, and appropriate dialog semantics. Existing overlays MUST be retrofitted to it.
- **FR-RS-024**: All redesigned and retrofitted surfaces MUST use the Organic design tokens only; the components currently using raw non-token colours (and one non-existent utility class) MUST be corrected as part of this work.
- **FR-RS-025**: Every interactive element MUST be a real control with an accessible name, a visible focus indicator, and a touch target of at least 44px in each dimension; toast messages MUST be announced to assistive technology; and animation MUST be suppressed when reduced motion is preferred.

**Contract & scope**

- **FR-RS-026**: This spec MUST NOT introduce a new data model or API endpoint, and MUST NOT rename existing routes; the named `004` requirements it supersedes (tab labels; phone calendar layout and placement; Kitchen list treatment) MUST be recorded as superseded rather than edited in place, so `004`'s shipped scope boundary stays verifiable.

### Key Entities

*No new persisted entity.* This feature is presentational; it reads existing inventory, meal-plan, grocery-list, recommendation and feedback data. Two **ephemeral UI states** are introduced: the desktop sidebar's collapsed preference (persisted client-side only) and the phone calendar's selected day.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-RS-001**: Every screen renders without horizontal page scrolling and with navigation visible at all five viewport classes — 100% of screen × viewport combinations.
- **SC-RS-002**: Navigation and the feedback affordance remain visible while scrolling any screen at any viewport — no case where they scroll away.
- **SC-RS-003**: 100% of interactive controls have an accessible name, a visible focus indicator, and a touch target of at least 44px in each dimension.
- **SC-RS-004**: Every overlay traps focus while open and restores focus to its opener on close, in 100% of overlays, on both touch and desktop presentations.
- **SC-RS-005**: Opening Home, the Kitchen or the meal plan issues **zero** automatic recommendation/AI requests; such requests occur only after an explicit user action.
- **SC-RS-006**: All four Home figures match the underlying data they are derived from, with no new endpoint added (verifiable by diff of the API surface).
- **SC-RS-007**: All shipped capabilities remain available after the redesign — inventory edit/delete/expiry/select-mode, drag-and-drop rearrangement on large viewports, cook/un-cook semantics, immediate grocery purchase and reversal, feedback chat, promote, and the pipeline view — verified by the existing regression suites continuing to pass.
- **SC-RS-008**: Zero non-token colour values remain in redesigned or retrofitted components, and no reference to a non-existent utility class remains.
- **SC-RS-009**: The desktop sidebar's collapsed preference survives a reload in 100% of attempts.

## Assumptions

- **The handoff's premise is corrected, not inherited.** The app is not "desktop-only"; it is "never designed responsively". Elements the handoff frames as new — the bottom pill nav, the collapsing Kitchen columns — already exist and are retained rather than rebuilt.
- **Shipped behaviour outranks the design** wherever they conflict; the reconciliation table above is the binding record of each such decision.
- **Home is additive.** It becomes the app's landing surface conceptually, but no route is renamed in this spec, so the existing entry point continues to work; where Home physically lives is a per-branch plan decision consistent with FR-RS-026.
- **Recipe method steps are out of scope.** The design's numbered cooking steps require data the meal model does not carry; the recipe overlay shows what exists (description + verified link).
- **Date handling stays as shipped.** The app is deliberately UTC-anchored; the handoff's local-date advice is *not* applied piecemeal, since mixing conventions is what would introduce an off-by-one.
- **Seed data in the handoff is illustrative**, not a fixture to reproduce; all figures derive from live data.
- **`impl/vite` is deferred by decision**, consistent with specs `003`, `004` and later.

## Dependencies

- **Spec `004`** (Organic design system): token, type and component source of truth; named requirements superseded per FR-RS-026.
- **Spec `005`** (intelligent quick-add): the parse-preview UX FR-RS-011 must retain.
- **Spec `006`** (cook-time consumption): the consumption contract FR-RS-014 must preserve.
- **Spec `007`** (grocery check-off): the purchase/reversal semantics FR-RS-017/018 must preserve — and whose model the design's checkout must not replace.
- **Spec `008`** (rolling grocery refresh): the rolling semantics FR-RS-019 must surface.
- **Spec `009`** (manual-only + scoped recommendations): the no-auto-call rule FR-RS-015/021 must honour.
- **Spec `003`** (+ v4.8.0 development pipeline): the feedback surfaces FR-RS-006 must not displace.
- **Deferred follow-up:** route renaming (`/fridge`, `/plan`, `/list`) as its own task.
