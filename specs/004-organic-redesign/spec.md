# Feature Specification: Organic UI Redesign

**Feature Branch**: `004-organic-redesign`
**Created**: 2026-07-13
**Status**: Draft
**Input**: User description: "Uplift the UI of the web application onto the Organic design system (warm cream ground, terracotta + sage accents, Caprasimo/Figtree type, heavily rounded shapes), plus two confirmed UX changes — a floating bottom tab bar and a natural-language smart quick-add — across all four screens (Kitchen, Meal plan, Groceries, Feedback)."

> **Shared contract (both implementations).** This spec is authored to be **topology-agnostic**: it defines *what* the redesigned experience must look like and do — never *how* (React framework, routing, CSS pipeline are per-branch `plan.md` concerns). Per the roadmap (Phase G), implementation proceeds on `impl/nextjs` first; the `impl/vite` implementation is **deferred by decision** and inherits this spec on the next `main` sync. It is promotable to `main` verbatim.
>
> **FR numbering:** Phase G requirements use the `FR-UI-xxx` prefix to avoid collision with `001`'s `FR-0xx`, `002`'s `FR-D-xxx`, and `003`'s `FR-F-xxx`.
>
> **Self-contained design source.** Every colour, type, spacing, radius, copy string, and client-side algorithm needed to build this redesign lives in [`design/organic-design-system.md`](design/organic-design-system.md) (tokens + per-screen visual spec) and [`design/reference-logic.md`](design/reference-logic.md) (the natural-language parser, expiry labelling, and stepper sizing, given as language-neutral pseudocode with worked examples). These two files are the **canonical design reference**; the original external design handoff may be deleted once this spec exists.
>
> **Scope boundary.** This is a **frontend / presentation** feature. It introduces **no new API endpoints, no data-model changes, and no contract changes.** Every interaction maps onto existing endpoints (see FR-UI-030). Two existing flows are intentionally **removed/replaced** (inventory edit-in-place; the checkout confirmation modal) and one is **demoted** (drag-and-drop meal placement → optional enhancement behind tap-to-place). These removals are confirmed product decisions, captured as FR-UI-031.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A cohesive, warm visual system across every screen (Priority: P1)

Every screen of the app — Kitchen (inventory), Meal plan, Groceries, and Feedback — is restyled onto one "Organic" design language: a warm cream page ground, terracotta and sage accents, a display heading typeface (Caprasimo) paired with a humanist body typeface (Figtree), and heavily rounded cards, pills, and controls. Colours, type, spacing, radii, shadows, icon style, and interaction states are consistent and come from a single shared token set.

**Why this priority**: The visual system is the foundation every other story renders on top of. Without the tokens, fonts, and shell in place, none of the screen-level work can look correct. It is also the smallest independently shippable slice: applying the ground, type, and shell already transforms the app.

**Independent Test**: Load the app after only the tokens + fonts + shell are in place and confirm the cream ground, the two typefaces, the brand header, and the bottom tab bar render on every route with the specified colours and radii — before any screen-specific work.

**Acceptance Scenarios**:

1. **Given** any route, **When** the page loads, **Then** the page ground is the cream colour, headings render in the display face and body text in the humanist face, and the palette matches the token set in the design reference.
2. **Given** any interactive control (button, input, tab, checkbox), **When** it receives keyboard focus, **Then** it shows a 2px terracotta focus outline (never the browser's default blue ring).
3. **Given** any hover-able control, **When** the pointer hovers it, **Then** its background moves exactly one step along the token ramp (no ad-hoc colours).

---

### User Story 2 - Navigate with a floating bottom tab bar (Priority: P1)

The former top header links are replaced by a floating dark pill fixed at the bottom-centre of the viewport. It holds four tabs — Kitchen, Meal plan, Groceries, Feedback — each an icon plus label. The active tab is filled terracotta; the app's brand mark and name sit unobtrusively at the top of the page.

**Why this priority**: Navigation is used on every screen and is one of the two headline UX changes. It must land with the shell (US1) for the app to be usable in the new design.

**Independent Test**: Can be tested by rendering the shell and confirming the four tabs, their routes, their renamed labels, the active-tab highlight, and `aria-current` on the active route — independently of any screen content.

**Acceptance Scenarios**:

1. **Given** the app on the Kitchen route, **When** the bottom tab bar renders, **Then** the Kitchen tab is filled terracotta and marked `aria-current`, and the other three tabs are inactive.
2. **Given** any tab, **When** the user activates it, **Then** the app navigates to that tab's route and the active highlight moves to it.
3. **Given** the navigation, **When** it renders, **Then** the tab labels read "Kitchen", "Meal plan", "Groceries", and "Feedback" (the former "Inventory", "Meal Plan", "Grocery List" labels are gone).
4. **Given** the Kitchen route, **When** one or more inventory items are urgent (expiring within two days), **Then** the Kitchen tab shows a small count badge of urgent items.

---

### User Story 3 - Add to the kitchen by typing it the way you'd say it (Priority: P1)

On the Kitchen screen, the old multi-field add form is replaced by a single natural-language input. As the user types "2L milk expires friday", a live preview shows how it will be interpreted — name, quantity + unit, category · location, and a parsed expiry date. Pressing Enter (or the Add button) files the item and shows a confirmation toast. Staple shortcut chips ("+ Milk", "+ Eggs", …) pre-fill the input.

**Why this priority**: Smart quick-add is the second headline UX change and the primary way inventory is created. It is independently demonstrable and central to the redesign's "type it like you'd say it" promise.

**Independent Test**: Can be tested by typing several phrasings into the input and asserting the live preview's parsed fields, then submitting and confirming the item appears in the list with those fields and a toast is shown.

**Acceptance Scenarios**:

1. **Given** the quick-add input, **When** the user types "2L milk expires friday", **Then** the preview shows name "Milk", quantity "2 L", category "Dairy", location "fridge", and an expiry tag for the next Friday.
2. **Given** a parsed preview, **When** the user presses Enter, **Then** an inventory item with the previewed fields is created, the input clears, and a toast reads "Milk added to your fridge".
3. **Given** the input is empty or the text has no recognisable item name, **When** the user submits, **Then** nothing is added and no error is thrown.
4. **Given** a staple chip (e.g. "+ Eggs"), **When** the user clicks it, **Then** the input is filled with that staple's text and the preview updates accordingly.

---

### User Story 4 - See what's urgent and manage items inline (Priority: P2)

The Kitchen screen surfaces a "Use soon" strip whenever any item expires within two days, and presents items as rounded rows sorted soonest-expiry-first. Each row shows a status dot (expired / expiring / fresh), the name and category·location, a plain-language expiry line, an inline quantity stepper with unit-aware steps, and a delete button. Decrementing to zero removes the item.

**Why this priority**: Turns the inventory list from a static table into the redesign's expiry-aware, inline-editable surface — but it depends on the shell (US1) and complements quick-add (US3).

**Independent Test**: Can be tested by seeding items with varied expiries and units, then asserting the sort order, the use-soon strip contents, the per-row expiry copy, the stepper's step sizes, and zero-removal.

**Acceptance Scenarios**:

1. **Given** items with mixed expiry dates, **When** the list renders, **Then** items are ordered soonest-expiry-first with no-expiry items last, and each row's status dot and expiry line reflect its urgency.
2. **Given** at least one item expiring within two days, **When** the Kitchen screen renders, **Then** the use-soon strip appears listing those urgent items; when none are urgent, the strip is absent.
3. **Given** an item measured in grams or millilitres, **When** the user taps the stepper's + / −, **Then** the quantity changes by 50 (by 0.5 for kg/L, by 1 otherwise).
4. **Given** an item at its minimum quantity, **When** the user decrements below the step, **Then** the quantity floors at zero and the item is removed from the list.

---

### User Story 5 - Plan meals by tapping a suggestion onto a slot (Priority: P2)

From the recommendations panel (or the calendar's suggestions rail), the user picks "Plan it" / "Place on calendar" on a meal. This enters a placement mode: a banner names the meal being placed, and the week grid's empty slots become the only click targets. Tapping an open slot files the meal there and shows a confirmation toast. This tap-to-place flow is the primary way to schedule meals; drag-and-drop, if kept, is only an optional enhancement.

**Why this priority**: Tap-to-place is the redesign's touch-friendly replacement for drag-and-drop and connects recommendations to the calendar. It is valuable but sits above the core inventory stories.

**Independent Test**: Can be tested by activating placement on a meal, asserting the placement banner and that empty slots become clickable, then placing into a slot and confirming the meal appears there and placement mode exits.

**Acceptance Scenarios**:

1. **Given** a meal in the recommendations panel, **When** the user chooses "Plan it", **Then** the app moves to the Meal plan screen in placement mode showing a banner naming that meal.
2. **Given** placement mode is active, **When** the week grid renders, **Then** empty slots are highlighted as the click targets and filled slots are not placement targets.
3. **Given** placement mode is active, **When** the user taps an empty slot, **Then** the meal is scheduled into that slot, placement mode exits, and a toast confirms the day and meal type.
4. **Given** placement mode is active, **When** the user chooses "Cancel", **Then** placement mode exits with no change to the plan.

---

### User Story 6 - Shop the grocery list and move purchases into the kitchen (Priority: P2)

The Groceries screen presents a centred list grouped by category with a sage progress bar, round terracotta check controls, and a quick-add input reusing the natural-language parser. Once at least one item is checked, a full-width "Done shopping — move N items into my kitchen" button appears; activating it removes the checked items from the list, adds them to inventory, and shows a toast. This inline checkout replaces the former confirmation modal.

**Why this priority**: Completes the redesign of the shopping loop and reuses the quick-add parser, but depends on the shell and the parser from earlier stories.

**Independent Test**: Can be tested by checking items, asserting the progress bar and the checkout button's count, then completing checkout and verifying the checked items leave the list, arrive in inventory, and a toast is shown.

**Acceptance Scenarios**:

1. **Given** a grocery list with items in several categories, **When** the screen renders, **Then** items are grouped under category headings with a progress bar reflecting the purchased fraction.
2. **Given** an unchecked item, **When** the user taps its round check, **Then** it toggles to purchased instantly (optimistic), its label strikes through, and the progress bar animates.
3. **Given** at least one checked item, **When** the user activates "Done shopping", **Then** the checked items are removed from the list, added to inventory, and a toast reads "N items moved into your kitchen".
4. **Given** no items are checked, **When** the screen renders, **Then** the checkout button is not shown.

---

### User Story 7 - A warmer feedback chat, with global toasts (Priority: P3)

The Feedback screen is restyled as a centred chat: a scrolling card with an empty-state prompt, per-message "You"/"Assistant" labels, rounded terracotta (user) and cream (assistant) bubbles, a pending "…" bubble, and a pill input that sends on Enter. A single global toast component — used by inventory add/remove, placement, and checkout — appears above the tab bar and auto-dismisses.

**Why this priority**: Lowest-risk restyle of an existing flow plus the shared toast; the feedback conversation contract is unchanged, so this is purely presentational.

**Independent Test**: Can be tested by rendering the chat with seeded messages and asserting bubble alignment/labels and the empty state; and by triggering a toast from any action and asserting it appears then disappears.

**Acceptance Scenarios**:

1. **Given** an empty feedback conversation, **When** the screen renders, **Then** the centred empty-state prompt is shown.
2. **Given** a conversation with user and assistant messages, **When** it renders, **Then** user messages are right-aligned terracotta bubbles and assistant messages are left-aligned cream bubbles, each with its role label.
3. **Given** any action that emits a toast, **When** it fires, **Then** exactly one toast appears above the tab bar and auto-dismisses after roughly 2.6 seconds.

---

### Edge Cases

- **Ambiguous quick-add text** (no unit, unknown category keyword): parser defaults quantity to 1, unit to "count", category to "Other", location to "fridge"; a bare number with no name adds nothing.
- **Expiry token variants**: weekday names ("friday"), relative offsets ("3d", "2w"), and `dd/mm` are all accepted; unrecognised tokens leave the item with no expiry rather than erroring.
- **Weekday already today**: "expires monday" on a Monday resolves to the *next* Monday (7 days out), never today.
- **Placement mode with a full week**: if every slot is filled, no slot is a target; the user cancels or clears a slot first.
- **Checkout with zero checked items**: the checkout button is absent, so the action cannot fire.
- **Narrow viewports**: the Kitchen two-column layout collapses to a single column below ~900px; the centred Groceries/Feedback columns and the bottom tab bar remain usable from 320px up.
- **Reduced motion**: the only animations are background-colour and progress-bar width transitions; there are no entrance animations to suppress.
- **Toast overlap**: a new toast replaces the current one (single global toast), so toasts never stack.

## Requirements *(mandatory)*

### Functional Requirements

**Design system & shell**

- **FR-UI-001**: The application MUST render on the Organic token set — cream page ground, terracotta and sage accent ramps, neutral ramp, dividers, and muted text — exactly as enumerated in the design reference. No colours outside the token set may be introduced.
- **FR-UI-002**: Headings MUST use the display typeface (Caprasimo 400) and body text the humanist typeface (Figtree 400/600/700), at the type scale and metrics in the design reference; fonts MUST be self-hosted/bundled (no layout-shifting external blocking fetch at render).
- **FR-UI-003**: Radii, shadows, and icon style (single icon set, stroke width 2.75) MUST match the design reference; small controls (buttons, tags, inputs, segmented controls) MUST be fully pill-rounded.
- **FR-UI-004**: Interaction states MUST follow the reference: hover = one ramp step past base; `:focus-visible` = 2px terracotta outline, offset 2px (never the default focus ring); selection = 30% accent tint; disabled = 45% opacity. Links are terracotta, hover one step darker.
- **FR-UI-005**: The page MUST use the cream ground with bottom padding that clears the floating tab bar, and a max-width content container as specified.
- **FR-UI-006**: A brand header (terracotta circle with a white fridge icon + "Fridge Planner" in the display face) MUST sit at the top of the page with no border on the cream ground.

**Navigation**

- **FR-UI-007**: Navigation MUST be a floating dark pill fixed at the bottom-centre of the viewport, holding four tabs, above page content in stacking order.
- **FR-UI-008**: The four tabs MUST be Kitchen (route `/`), Meal plan (`/calendar`), Groceries (`/grocery`), and Feedback (`/feedback`), each an icon (stroke 2.75) plus label, using the specified icons.
- **FR-UI-009**: Tab labels MUST be exactly "Kitchen", "Meal plan", "Groceries", "Feedback" — replacing the former "Inventory", "Meal Plan", "Grocery List" labels.
- **FR-UI-010**: The active tab MUST be filled terracotta with cream text and carry `aria-current`; inactive tabs MUST be transparent with neutral-300 text and a 12% white hover tint. Existing active-route logic MUST be preserved.
- **FR-UI-011**: The Kitchen tab MUST show a count badge when one or more inventory items are urgent (expiring within two days).

**Kitchen / Inventory screen**

- **FR-UI-012**: The Kitchen screen MUST use a two-column layout (item column + recommendations panel) that collapses to one column on narrow viewports, with the left column stacking: use-soon strip → smart quick-add → location filter → item list.
- **FR-UI-013**: A use-soon strip MUST appear whenever any item expires within two days, listing each urgent item with a relative-time pill and a control that scrolls to the recommendations panel; it MUST be absent when nothing is urgent.
- **FR-UI-014**: The smart quick-add MUST be a single natural-language input with a live parse preview (name, quantity+unit, category·location, and parsed expiry when present) that updates on every keystroke, plus staple shortcut chips that pre-fill the input.
- **FR-UI-015**: The natural-language parser MUST implement the rules in the design reference: leading quantity+unit, `expires <token>` where token is a weekday / relative offset (`Nd`/`Nw`) / `dd/mm`, keyword-based category+location guessing, title-cased name, and the documented defaults. It MUST run client-side and produce the same structured item the app persists.
- **FR-UI-016**: Submitting quick-add (Enter or Add) MUST create the previewed item via the existing inventory API, clear the input, and show a confirmation toast; empty or name-less input MUST be a no-op.
- **FR-UI-017**: The item list MUST render each item as a rounded row with a status dot (expired / expiring ≤2 days / fresh), name, category·location, a plain-language expiry line, an inline quantity stepper, and a delete control; expired rows use the accent-100 background.
- **FR-UI-018**: Items MUST be sorted soonest-expiry-first with no-expiry items last.
- **FR-UI-019**: The quantity stepper MUST step by 50 for g/ml, 0.5 for kg/L, and 1 otherwise; decrementing an item to zero MUST remove it. Inventory edit-in-place (the former per-field edit) is removed — the stepper and delete cover quantity mutation. *(Revised 2026-07-15 per user feedback: each item row MUST offer an edit control opening an editor for the item's **expiry date** (settable and clearable to "no expiry") and **location** (fridge / freezer / pantry) via the existing update endpoint; name, category, and unit remain non-editable in place.)*
- **FR-UI-020**: A location filter segmented control (All / Fridge / Freezer / Pantry) MUST filter the list, with a right-aligned "N of M items" count.

**Recommendations, Meal plan & placement**

- **FR-UI-021**: The recommendations panel and each meal card MUST be restyled per the design reference (kicker, title, meta, description, and ingredient tags: expiring / on-hand / missing variants).
- **FR-UI-022**: Choosing "Plan it" on a meal MUST enter placement mode carrying that meal to the Meal plan screen.
- **FR-UI-023**: The Meal plan screen MUST show a 7-day week grid with per-day columns; today's column MUST be outlined; each day has breakfast/lunch/dinner/snack slots. Filled slots show the slot label, meal name, and time with a clear (×) control; empty slots show a dashed placeholder.
- **FR-UI-024**: In placement mode, a banner MUST name the meal being placed and offer Cancel; empty slots MUST become the highlighted, sole click targets; tapping one schedules the meal via the existing meal-plan API, exits placement mode, and shows a confirmation toast.
- **FR-UI-025**: A suggestions rail below the grid MUST present mini meal cards each offering "Place on calendar", entering the same placement flow.
- **FR-UI-026**: Tap-to-place MUST be the primary placement interaction and MUST work without drag-and-drop; drag-and-drop MAY be retained only as an optional enhancement.

**Groceries screen**

- **FR-UI-027**: The Groceries screen MUST be a centred column with a header (title + week/context line + a "Regenerate" control), a progress bar reflecting the purchased fraction, category-grouped item rows with round check controls, a natural-language quick-add reusing the parser, and the inline checkout.
- **FR-UI-028**: Toggling an item's check MUST update its purchased state optimistically (strike-through + progress animation) via the existing grocery API.
- **FR-UI-029**: When at least one item is checked, a full-width "Done shopping — move N items into my kitchen" button MUST appear; activating it MUST remove the checked items from the list, add them to inventory, and show a toast. This inline checkout replaces the former checkout confirmation modal.

**Cross-cutting**

- **FR-UI-030**: The redesign MUST introduce no new API endpoints and no data-model or contract changes; every interaction MUST map onto the existing endpoints (inventory CRUD, meal-plan entries, grocery-list items/complete, recommendations, feedback chat). Client-side parsing produces the structured payloads those endpoints already accept.
- **FR-UI-031**: The following existing flows are intentionally changed: inventory edit-in-place is **removed** (FR-UI-019 — partially reversed 2026-07-15: a scoped expiry/location editor is restored per user feedback); the grocery checkout confirmation modal is **replaced** by inline checkout (FR-UI-029); drag-and-drop meal placement is **demoted** to an optional enhancement behind tap-to-place (FR-UI-026 — the optional drag enhancement was exercised 2026-07-15 for rearrangement, see spec 001 FR-022). Their removal MUST NOT break the underlying API behaviour they used.
- **FR-UI-032**: A single global toast component MUST be used by inventory add/remove, placement, and checkout; it MUST appear above the tab bar, show one message at a time, and auto-dismiss after ~2.6 seconds.
- **FR-UI-033**: The Feedback chat MUST be restyled (empty state, role-labelled aligned bubbles, pending bubble, pill input, Enter-to-send) without changing the feedback conversation contract.
- **FR-UI-034**: Existing component/interaction tests affected by label and interaction changes (navigation, inventory, grocery, calendar) MUST be updated to the new copy and flows, and the natural-language parser MUST have its own unit tests.

### Constitutional Requirements (MANDATORY)

Not every constitutional clause is exercised by a presentation-only feature; the relevant ones for Phase G:

**Testing Standards**:
- **CR-005**: Tests MUST be written for the new behaviour (parser, stepper sizing, placement, checkout) — TDD where practical.
- **CR-006**: Frontend code coverage MUST remain ≥70%.
- **CR-007**: The redesign MUST NOT alter existing API contracts; contract tests MUST continue to pass unchanged.

**Performance & Accessibility**:
- **CR-009**: Frontend Time to Interactive MUST remain within budget; fonts MUST be bundled to avoid render-blocking and layout shift (FR-UI-002).
- **CR-010**: Responsive design MUST support 320px–1920px (FR-UI-012 collapse behaviour, centred columns, tab bar).
- **CR-011**: The UI MUST remain WCAG 2.1 AA compliant — visible non-default focus outline (FR-UI-004), `aria-current` on the active tab (FR-UI-010), sufficient contrast from the token set, and keyboard-operable controls.

**API-First / Config / Statelessness**:
- **CR-012/CR-014**: No API changes; existing versioned endpoints are reused unchanged (FR-UI-030).
- **CR-016/CR-017**: New client dependencies (icon library, fonts, E2E tooling) MUST be declared in the lockfile.

### Key Entities *(include if feature involves data)*

No new persisted entities. The redesign reuses the existing `InventoryItem`, `MealPlan` (+ entries), `GroceryList` (+ items), `MealRecommendation`, and feedback conversation shapes unchanged. Two **client-only, ephemeral** state additions:

- **Placement state**: the meal currently being placed (`{ mealName, time } | null`), shared between the recommendations/suggestions surfaces and the calendar; not persisted.
- **Toast state**: the single active toast message and its auto-dismiss timer; not persisted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-UI-001**: All four screens (Kitchen, Meal plan, Groceries, Feedback) render on the Organic token set with the specified ground, type, and shell — verifiable by screenshot on each route.
- **SC-UI-002**: 100% of the colours, type sizes, radii, and shadows used by the redesigned screens trace to a token in the design reference (no ad-hoc values).
- **SC-UI-003**: A user can add an inventory item by typing a natural-language phrase and pressing Enter, with the resulting item's name, quantity, unit, category, location, and expiry matching the live preview — for at least the worked examples in the design reference.
- **SC-UI-004**: A user can schedule a recommended meal onto a calendar slot using only taps (no drag), and the meal persists via the existing meal-plan endpoint.
- **SC-UI-005**: A user can check grocery items and complete checkout with a single button, after which the checked items are gone from the list and present in inventory.
- **SC-UI-006**: Frontend test coverage remains ≥70%, the production build succeeds, and a Playwright end-to-end run drives all four screens and captures screenshot proof of each.
- **SC-UI-007**: Every interactive control shows the terracotta focus outline on keyboard focus and the active navigation tab carries `aria-current` (WCAG-relevant states verifiable in tests/E2E).
- **SC-UI-008**: The feature ships with **no** changes to `app/api/**`, server controllers, models, or the API contract — verifiable by diff.
