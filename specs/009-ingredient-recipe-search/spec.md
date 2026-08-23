# Feature Specification: Ingredient-Driven Recipe Search + Manual-Only Recommendations

**Feature Branch**: `009-ingredient-recipe-search`
**Created**: 2026-07-23
**Status**: Draft
**Input**: User description: "Ingredient-driven recipe search + manual-only Get Recommendations — let users pick specific inventory items and ask for recipe recommendations grounded on that selection instead of only the whole-inventory default; stop auto-loading recommendations on login; plus an EC-03 quick-add duplicate auto-merge mini-task. Amends spec 001 FR-012/FR-014 + quick-add duplicate handling. Priority-backlog #5."

> **Relationship to prior specs.** Today recommendations always run over the *whole* non-expired inventory and fire automatically when the meal-plan screen first loads. This spec adds **user control on both ends**: the user chooses *which* ingredients to cook from (a grounded subset), and the user decides *when* to spend an agent call (explicit request, no auto-load). It reuses the existing recommendations pipeline unchanged downstream — spec 006 ingredient grounding, the ingredient-keyed result cache, and spec 001 FR-037 lazy recipe-link verification all apply as-is; only the *input scope* and the *trigger* change. A small **EC-03 quick-add fix** rides along (restore duplicate-name merge, lost when the Phase G smart quick-add replaced the classic form).

## Clarifications

### Session 2026-07-23 (hash-out, decisions FIXED)

- Q: What can a scoped search be grounded on? → A: **Inventory items only** — every request stays fully inventory-grounded (spec 006 validation unchanged); free-text ingredient entry is explicitly out of scope, deferred to a later spec.
- Q: Where does the selection flow live? → A: **Two entry points** — a select mode on the Kitchen/inventory list ("Find recipes with selected") **and** ingredient-filter chips on the meal-plan suggestions rail.
- Q: What shows before the first explicit request now that auto-load is gone? → A: **Empty state + call-to-action, zero agent calls** until the user asks; results cached earlier in the session still display instantly.
- Q: How do whole-inventory and scoped requests relate? → A: **One contextual "Get Recommendations" action** — no selection means whole inventory, an active selection means scoped to that selection.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recommendations only when I ask (Priority: P1)

A user opens the meal-plan screen. Instead of the app immediately spending an AI call to fill a suggestions area they may not even want, they see a calm empty state with a clear "Get Recommendations" button. Nothing is fetched until they tap it. When they do, the familiar whole-inventory suggestions appear. If they already fetched earlier in the same session, those results are still shown instantly without re-asking.

**Why this priority**: This is the highest-value, lowest-risk slice — it removes an unwanted automatic cost/latency on every visit and is independently shippable without any selection UI. It also establishes the manual-trigger foundation that Story 2 scopes.

**Independent Test**: Load the meal-plan screen fresh (no prior request this session) → no recommendation request is issued and an empty state with a CTA is shown → tap "Get Recommendations" → whole-inventory suggestions load. Revisit the screen in the same session → prior results show with no new request.

**Acceptance Scenarios**:

1. **Given** a first visit to the meal-plan screen this session, **When** the screen loads, **Then** no recommendation request is made and an empty state with a "Get Recommendations" call-to-action is shown.
2. **Given** the empty state, **When** the user taps "Get Recommendations" with no ingredients selected, **Then** recommendations are generated over the whole non-expired inventory (existing behaviour, now explicitly triggered).
3. **Given** the user already fetched recommendations earlier this session, **When** they return to the meal-plan screen, **Then** the earlier results are displayed immediately without a new request.
4. **Given** inventory is empty, **When** the user taps "Get Recommendations", **Then** the existing empty-inventory fallback applies (popular recipes, EC-01) — the manual trigger changes when the call happens, not the empty-inventory behaviour.

---

### User Story 2 - Cook from what I pick (Priority: P2)

A user is staring at chicken and spinach that need using up. They enter a select mode on the Kitchen list, tick those two items, and tap "Find recipes with selected". The recommendations that come back are grounded on that selection rather than the whole fridge — recipes that actually use the chicken and spinach. They can also reach the same scoping from the meal-plan suggestions rail via ingredient-filter chips, without leaving that screen.

**Why this priority**: This is the headline feature, but it depends on Story 1's manual-trigger action existing first (the scoped request is the same contextual action with a selection attached). It delivers the "recipes for these specific things" value the backlog item was raised for.

**Independent Test**: Select two inventory items in Kitchen select mode → "Find recipes with selected" → the returned suggestions are grounded on those two items and prioritise the sooner-expiring of them. Repeat via the suggestions-rail chips → same scoped result.

**Acceptance Scenarios**:

1. **Given** Kitchen select mode with "chicken" and "spinach" ticked, **When** the user taps "Find recipes with selected", **Then** recommendations are generated grounded on only those items, and each suggestion draws from the selection.
2. **Given** the meal-plan suggestions rail, **When** the user activates ingredient-filter chips for a subset of inventory and requests recommendations, **Then** the result is scoped identically to the Kitchen-initiated path (the two entry points converge on one scoped request).
3. **Given** a selection where one item expires sooner than the other, **When** scoped recommendations are generated, **Then** expiry prioritisation applies *within the selection* (the sooner-to-expire selected item is favoured).
4. **Given** an active selection, **When** the user clears it and requests recommendations, **Then** the request falls back to the whole-inventory path (one contextual action; empty selection = whole inventory).
5. **Given** the user requests the same selection twice in the caching window, **When** the second request is made, **Then** the cached scoped result is returned without a new agent call (per-selection caching).

---

### User Story 3 - Quick-add stops stacking duplicates (Priority: P3)

A user quick-adds "milk" when they already have a "Milk" item in the fridge. Instead of silently creating a second row, the app merges the new quantity into the existing item and shows an "Undo" toast in case that was not what they wanted. Their fridge stays tidy without an interrupting prompt.

**Why this priority**: An independent, small correctness fix riding along in this release — unrelated to recommendations but scoped here because it touches the same inventory-quick-add surface and was an open hygiene decision (EC-03). Lowest priority because it is self-contained and does not block Stories 1–2.

**Independent Test**: With an existing "Milk" item, quick-add "milk 1L" → no duplicate row is created; the existing item's quantity increases and an "Undo" toast appears; tapping Undo restores the pre-merge state.

**Acceptance Scenarios**:

1. **Given** an existing non-expired "Milk" item with a compatible unit, **When** the user quick-adds another "milk", **Then** the quantities merge into the existing item (no duplicate row) and an "Undo" toast is shown.
2. **Given** the merge just happened, **When** the user taps "Undo" on the toast, **Then** the inventory returns to its exact pre-merge state (the existing item's quantity is restored and no new item lingers).
3. **Given** an existing "Milk" item that is expired, or whose unit is incompatible with the added amount, **When** the user quick-adds "milk", **Then** a separate new item is created (expired/incompatible items are never merge targets — consistent with spec 007 FR-GC-005).

---

### Edge Cases

- **Selection includes an expired item**: expired items are never grounding targets for recommendations (consistent with FR-012 excluding expired stock); a selection of only expired items behaves as an empty selection → whole-inventory path (or EC-01 if inventory has no non-expired items).
- **Selected item deleted/edited before the request completes**: the request is grounded on the selection as it was at request time; the server re-validates against live inventory (spec 006 grounding) and drops anything no longer present.
- **Single-item selection**: valid — recipes grounded on one ingredient (no minimum selection size).
- **Large selection (approaching whole inventory)**: valid and equivalent to — but not automatically collapsed into — the whole-inventory request; caching keys on the actual ingredient set.
- **Rate limit reached**: scoped and whole-inventory requests draw on the same request budget; the existing rate-limit notice applies to both.
- **Undo after further edits**: if the user edits the merged item before tapping Undo, Undo restores the pre-merge quantity baseline; define precedence so Undo never produces a negative or phantom quantity.
- **Recipe-link verification on scoped results**: the FR-037 lazy link phase runs unchanged on scoped results (unlinked meals settle out the same way).

## Requirements *(mandatory)*

### Functional Requirements

**Manual-only recommendations (Story 1)**

- **FR-IR-001**: The system MUST NOT automatically request recommendations when the meal-plan screen loads; recommendations are generated only on an explicit user request.
- **FR-IR-002**: Before the first request in a session, the meal-plan suggestions area MUST show an empty state with a clear "Get Recommendations" call-to-action, and MUST issue zero agent calls until the user acts.
- **FR-IR-003**: Recommendation results already produced earlier in the session MUST remain displayed on return to the screen without triggering a new request.
- **FR-IR-004**: A whole-inventory request (no active selection) MUST produce the same recommendations behaviour as today (spec 001 FR-012/FR-014), including the empty-inventory popular-recipes fallback (EC-01) and FR-037 lazy link verification.

**Ingredient-scoped search (Story 2)**

- **FR-IR-005**: Users MUST be able to select a subset of their inventory items and request recommendations grounded on only that subset. Selection input is **inventory items only** — free-text ingredient entry is out of scope.
- **FR-IR-006**: Two entry points MUST reach the same scoped request: (a) a select mode on the Kitchen/inventory list with a "Find recipes with selected" action, and (b) ingredient-filter chips on the meal-plan suggestions rail.
- **FR-IR-007**: A single contextual "Get Recommendations" action MUST route to the whole-inventory path when no selection is active and to the scoped path when a selection is active (no separate always-visible second button for the two modes).
- **FR-IR-008**: Scoped recommendations MUST remain fully inventory-grounded — the selection is a subset of real inventory items, validated server-side against live inventory (spec 006 grounding), and expired items MUST NOT be grounding targets.
- **FR-IR-009**: Expiry prioritisation MUST apply within the selection (a sooner-to-expire selected item is favoured over a later-expiring selected item), mirroring whole-inventory expiry prioritisation.
- **FR-IR-010**: An empty selection (nothing ticked, or only expired items ticked) MUST route to the whole-inventory path (FR-IR-004).
- **FR-IR-011**: Scoped requests MUST share the existing recommendation request budget (rate limit) and the existing ingredient-keyed result cache, so repeating the same selection within the caching window returns the cached result without a new agent call.

**Quick-add duplicate merge (Story 3 — EC-03)**

- **FR-IR-012**: When a quick-added item's name matches an existing non-expired inventory item with a compatible unit, the system MUST merge quantities into the existing item instead of creating a duplicate, and MUST surface an "Undo" affordance; expired or unit-incompatible same-name items MUST NOT be merge targets (create a new item instead) — consistent with spec 007 FR-GC-005.
- **FR-IR-013**: The user MUST be able to undo an auto-merge and return inventory to its exact pre-merge state.

**Contract cascade**

- **FR-IR-014**: Spec 001 MUST be revised to match this spec: FR-012 annotated that recommendation generation is user-triggered (no auto-load), the FR-012/FR-014 recommendation area noted as supporting an optional grounded ingredient subset, and the inventory quick-add duplicate handling (EC-03 acceptance scenario) updated from the classic Merge/Add-separately/Cancel prompt to auto-merge + undo — so both implementations build from a consistent contract.

### Key Entities

- **Ingredient selection**: a transient, per-request set of inventory items the user chooses to ground recommendations on; not persisted beyond the request/session. Empty = whole inventory.
- **Recommendation request**: an explicit user-initiated generation, either whole-inventory or scoped; keyed for caching by its ingredient set; subject to the shared rate limit.
- **Inventory item**: existing entity; participates here as a selection member and as the target/source of a quick-add merge (name + unit compatibility + non-expired status govern merge eligibility).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-IR-001**: On a fresh session visit to the meal-plan screen, zero recommendation/agent calls are made until the user explicitly requests them (100% of first visits show the empty-state CTA with no network fetch to the recommendation service).
- **SC-IR-002**: A user can go from "these two items need using" to grounded recipe suggestions in at most two taps from the Kitchen list (enter select mode is one; ticking items then "Find recipes with selected").
- **SC-IR-003**: 100% of suggestions returned for a scoped request draw only on the selected (non-expired) items — no suggestion is grounded on an unselected ingredient.
- **SC-IR-004**: Both entry points (Kitchen select mode and suggestions-rail chips) produce identical results for the same selection (verified equivalent scoped output).
- **SC-IR-005**: Repeating an identical selection within the caching window serves a cached result (no second agent call), measurable as a cache hit.
- **SC-IR-006**: Quick-adding a duplicate name creates zero duplicate rows when a compatible non-expired item exists, and the merge is fully reversible via undo (post-undo state byte-equivalent to pre-merge).

## Assumptions

- **Manual trigger scope**: "no auto-load" applies to the meal-plan recommendation area specifically; other screens' data loading is unchanged. A session-scoped in-memory result (existing behaviour) is what "already fetched this session" relies on — no new persistence.
- **Selection is transient**: the ingredient selection is not saved across sessions or persisted server-side; it exists only to scope a request. Persisted "favourite ingredient sets" are out of scope.
- **Reuse over rebuild**: the recommendation pipeline (agent call, spec 006 grounding, ingredient-keyed cache, FR-037 lazy links, rate limit, EC-01 empty-inventory fallback) is reused unchanged; this feature changes the input scope and the trigger only.
- **Cache keying**: the existing cache keys on the ingredient set, so scoped requests cache per-selection with no new cache mechanism; a whole-inventory request and a full-selection request may key differently and that is acceptable.
- **EC-03 merge rule**: reuses spec 007 FR-GC-005 semantics (same-name, non-expired, compatible-unit → merge; else create new). Undo is a client-side reversal of the just-applied merge, mirroring the spec-007 receipt-reversal spirit but transient (no persisted receipt required for a quick-add merge).
- **Free-text ingredients**: explicitly deferred — a future spec may add un-grounded/typed ingredients, which would interact with spec 006 grounding validation.

## Dependencies

- **Spec 001** (recommendations): FR-012/FR-014 pipeline, EC-01 empty-inventory fallback, FR-037 lazy link verification — all reused; FR-012/FR-014 + EC-03 acceptance scenario revised on `main` per FR-IR-014.
- **Spec 006** (ingredient grounding): server-side grounding validation applies to scoped selections unchanged.
- **Spec 005** (intelligent quick-add): the quick-add flow whose duplicate handling FR-IR-012/013 restores.
- **Spec 004** (organic redesign): the Kitchen list and suggestions rail whose select-mode and chip affordances are extended (frontend).
