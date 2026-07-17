# Feature Specification: Inventory-Grounded Meal Consumption

**Feature Branch**: `006-meal-consumption`
**Created**: 2026-07-18
**Status**: Draft
**Input**: User description: "Inventory-grounded meal consumption — closes the plan→cook→inventory loop in two stages. Stage 1: recommended meals return inventory-grounded quantified ingredients validated against live inventory with tiered fallback matching. Stage 2: inventory deduction moves from planning time to an explicit 'mark cooked' action with idempotent completion, consumption receipts, and exact un-cook restore. Amends spec 001 FR-005 (consumption timing + semantics) and closes the FR-027/FR-028 deferral (SG-03)."

> **Relationship to spec 001:** this spec **amends FR-005** (ingredient consumption moves from *planning* time to an explicit *cooked* confirmation, with quantity-accurate amounts and exact reversal) and **closes the Phase-2+ deferral of FR-027 and FR-028** (net-amount grocery deduction and unit normalization — deferred by SG-03 because meals carried no ingredient quantities; this spec makes meals carry them). FR-026's servings model remains the fallback wherever quantities are unavailable. On completion, spec 006 is the canonical definition of consumption and quantity semantics; spec 001's FR-005/FR-026/FR-027/FR-028 receive pointer revisions per the spec-tweak cascade.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Meal suggestions grounded in what I actually have (Priority: P1)

When the system suggests meals, each suggestion states which of the user's **actual inventory items** it would use and **how much of each** — "uses 500 g of your chicken thighs (1 kg in fridge)" — instead of loose ingredient names that may or may not correspond to anything the user owns. Today "chicken breast" in a suggestion never matches the "chicken" in inventory, and amounts are invented or absent entirely, so the app cannot honestly say what a meal will take out of the fridge.

**Why this priority**: Every other story consumes what this one establishes. Correct cook-time deduction (Story 2), exact reversal (Story 3), and quantity-aware groceries (Story 4) are all impossible unless suggestions are first tied to real, owned items with real amounts. It also delivers standalone value: the "uses / missing" display becomes truthful.

**Independent Test**: Can be fully tested by seeding a known inventory, requesting meal suggestions, and verifying every from-inventory ingredient references a real owned item with a plausible amount in that item's unit — no cooking or grocery flow required.

**Acceptance Scenarios**:

1. **Given** an inventory containing "Chicken Thighs, 1 kg, fridge", **When** meal suggestions arrive, **Then** a meal using chicken identifies the actual "Chicken Thighs" item and an amount to consume no greater than 1 kg, expressed in a unit compatible with kg.
2. **Given** a suggestion references an ingredient by a name that differs from the owned item ("chicken breast" vs "chicken"), **When** the suggestion is prepared for display, **Then** the reference is resolved to the owned item by name similarity, or by the user's learned pairing memory — and only if neither resolves is it shown as a not-from-inventory (missing) ingredient.
3. **Given** a suggestion carries an item reference that does not exist in the user's inventory (stale, fabricated, or belonging to another user), **When** the suggestion is validated, **Then** the invalid reference is discarded and re-resolved by name; it is never followed, and it never causes an error or a dropped meal.
4. **Given** a suggested amount exceeds the owned quantity, **When** the suggestion is displayed, **Then** the stated consumption is capped at what is actually owned (the shortfall belongs on the grocery list, not in consumption).
5. **Given** the user's pairing memory already maps "mince" to their "Beef Mince" item, **When** a new suggestion mentions "mince", **Then** the mapping applies immediately without re-deriving it, and it applies only to this user's account.

---

### User Story 2 - Inventory changes when I cook, not when I plan (Priority: P2)

Planning a meal is intent; cooking it is fact. Adding a meal to the weekly calendar no longer touches inventory. Instead, each calendar entry has a **planned / cooked** state: when the user actually cooks the meal, they mark it cooked from the calendar, and only then are the grounded ingredient amounts deducted from inventory. The cooked entry is visually distinct on the calendar.

Today deduction fires the moment a meal is dropped on the calendar — so inventory lies all week about what is really in the fridge, and the grocery list double-counts (planning already deducted what the list then reports as needed).

**Why this priority**: This is the semantic heart of the feature — it makes inventory reflect reality and fixes the grocery double-count in one move. It depends on Story 1 for *accurate amounts*, but its timing change is independently testable.

**Independent Test**: Add a meal to the calendar and verify inventory is untouched; mark it cooked and verify the correct amounts are deducted exactly once, including under a repeated/double confirmation.

**Acceptance Scenarios**:

1. **Given** an inventory snapshot, **When** the user adds, moves, or replaces meals on the calendar, **Then** inventory is completely unchanged.
2. **Given** a planned entry whose meal uses 500 g of the user's 1 kg chicken thighs, **When** the user marks it cooked, **Then** the chicken thighs item drops to 500 g and the entry shows as cooked with the time it was cooked.
3. **Given** a cooked confirmation is submitted twice (double-tap, retry, or two devices), **When** both arrive, **Then** inventory is deducted exactly once.
4. **Given** inventory changed since the meal was suggested (some chicken was used elsewhere), **When** the user marks the meal cooked, **Then** deduction is capped at what is currently owned — never producing negative quantities.
5. **Given** a meal whose ingredient matches an owned item but carries no usable amount (e.g. a meal saved before this feature), **When** it is marked cooked, **Then** the matched item is decremented by one unit (the legacy behaviour); an ingredient matching nothing deducts nothing and is recorded as not consumed.
6. **Given** meals are planned but not yet cooked, **When** the grocery list is generated, **Then** needed amounts are computed against the full, un-deducted inventory (no double-count).
7. **Given** the user has just cooked a meal, **When** they request new meal suggestions, **Then** the suggestions reflect the reduced inventory.

---

### User Story 3 - Undo that actually undoes (Priority: P3)

Marking a meal cooked writes a **consumption receipt** — exactly which items were deducted, by how much, including a full snapshot of any item that consumption depleted to zero and removed. Un-marking the meal (back to planned) restores inventory **exactly** from that receipt, resurrecting depleted items with all their details. Deleting a cooked entry from the calendar keeps the consumption — the food was eaten; removing the record does not refill the fridge.

Today's reversal restores a fixed 1 unit per name and cannot resurrect an item that consumption deleted, so undo silently corrupts inventory.

**Why this priority**: Reversibility is what makes Story 2's explicit confirmation safe to use — a mis-tap must be a two-tap recovery, not a data-repair session. It builds directly on Story 2's receipts.

**Independent Test**: Cook a meal that partially consumes one item and fully depletes another; un-cook it; verify inventory is exactly as before, including the resurrected item.

**Acceptance Scenarios**:

1. **Given** a cooked meal that consumed 500 g of chicken thighs, **When** the user un-marks it, **Then** the 500 g is restored and the entry returns to planned.
2. **Given** a cooked meal that fully depleted an item (which was removed from inventory at zero), **When** the user un-marks it, **Then** the item reappears with its previous details (name, quantity, unit, category, location, expiry).
3. **Given** an un-cook is submitted twice, **When** both arrive, **Then** inventory is restored exactly once.
4. **Given** a cooked entry, **When** the user deletes it from the calendar, **Then** inventory is unchanged (the consumption stands); **Given** a planned entry, deleting it likewise changes nothing.
5. **Given** a cooked entry, **When** the user opens its detail view, **Then** they can see what was consumed from inventory when it was cooked.

---

### User Story 4 - A grocery list that counts real amounts (Priority: P4)

Where meals carry grounded quantities, the grocery list stops counting "meals that need milk" and starts counting **how much** milk: required amounts for the week are summed per ingredient, the user's non-expired owned stock is netted off, and only the true shortfall is listed ("Mince — 100 g" instead of "Mince ×2"). Lines whose amounts cannot be reconciled (unknown or incompatible units, ungrounded meals) fall back to the existing servings count — the list always generates.

**Why this priority**: This closes spec 001's deferred FR-027/FR-028 and is the payoff of Story 1's quantities — but the list is useful today in servings form, so it ranks below correcting the consumption semantics.

**Independent Test**: Plan two meals with grounded quantities for a shared ingredient, own a partial amount of it, generate the list, and verify the netted shortfall; include one meal with unusable amounts and verify that line falls back to servings.

**Acceptance Scenarios**:

1. **Given** two planned meals needing 200 g and 300 g of mince and an inventory holding 400 g (not expired), **When** the grocery list is generated, **Then** mince is listed as 100 g needed.
2. **Given** owned stock fully covers the summed need, **When** the list is generated, **Then** that ingredient is omitted from the purchase list.
3. **Given** the owned stock of a needed ingredient is expired, **When** the list is generated, **Then** the expired stock is not netted off — the full amount is listed for purchase.
4. **Given** a week mixing grounded and ungrounded meals, **When** the list is generated, **Then** grounded ingredients show real amounts and unresolvable lines show the servings count — generation never fails over units.
5. **Given** amounts in compatible units (1 kg and 500 g), **When** aggregated, **Then** they sum in one canonical unit (1.5 kg); incompatible units (1 L and 2 pieces) fall back to the servings count for that line.
6. **Given** manually added grocery items and checked-off purchases, **When** the list is regenerated, **Then** they are preserved exactly as today.

---

### Edge Cases

- A suggestion references another user's inventory item (by accident or manipulation): the reference is discarded during validation — cross-user data isolation (FR-036) holds everywhere in this feature.
- A suggested amount is zero, negative, or absurd (e.g. 900 kg of salt): non-positive amounts are discarded; amounts above owned stock are capped at consumption time.
- Two meals sharing an ingredient are cooked in quick succession: each deduction is applied atomically against live stock, each capped by what remains; the second receipt records the (smaller) amount actually consumed.
- The pairing memory or name-similarity resolution finds nothing: the ingredient is simply shown as not-from-inventory; resolution never blocks or degrades suggestion delivery.
- Calendar entries that exist before this feature ships: they are treated as **cooked** at cutover (their deduction already happened at planning time under the old rule) — they display as cooked but cannot be un-cooked (no receipt exists to restore from).
- A meal saved before this feature (or from the built-in fallback set) has no grounded ingredients: cook-time deduction uses name matching with the legacy one-unit decrement (Story 2, scenario 5).
- An item's unit changed between suggestion and cooking: amounts are converted where compatible; otherwise the legacy one-unit decrement applies to the matched item.

## Requirements *(mandatory)*

### Functional Requirements

**Grounded suggestions (Story 1)**

- **FR-MC-001**: Meal suggestions MUST identify, for each ingredient taken from the user's inventory, the specific owned inventory item and the amount to consume, expressed in that item's unit or a unit convertible to it.
- **FR-MC-002**: All item references and amounts carried by a suggestion MUST be treated as untrusted and validated against the user's **live** inventory before use: references must resolve to an item owned by that user (FR-036), amounts must be positive, and consumption amounts are capped at the owned quantity at the moment of consumption.
- **FR-MC-003**: Ingredient resolution MUST be tiered: (1) direct item reference, (2) name-similarity matching against owned items, (3) the user's learned pairing memory. An ingredient no tier resolves MUST remain visible as a not-from-inventory (missing) ingredient — never silently dropped, and never a cause of suggestion failure.
- **FR-MC-004**: Learned ingredient↔item pairings MUST be scoped to the individual user, reused without re-derivation for repeated identical lookups (bounded cost), and only ever supply mappings — a missing or wrong pairing can never block a suggestion or a cook.
- **FR-MC-005**: Grounding MUST NOT add perceptible delay or additional suggestion round-trips to the recommendations flow — suggestions arrive as fast as they do today.

**Cook-time consumption (Story 2)** *(amends spec 001 FR-005)*

- **FR-MC-006**: Adding, moving, replacing, or removing calendar entries MUST NOT change inventory. Inventory is deducted only by an explicit cooked confirmation.
- **FR-MC-007**: Every calendar entry MUST carry a state — **planned** or **cooked** (with the time it was cooked) — visible on the calendar and its detail view, with the cooked confirmation available from the entry.
- **FR-MC-008**: The cooked confirmation MUST be atomic and idempotent: however many times it is submitted for one entry, inventory is deducted exactly once.
- **FR-MC-009**: Cook-time deduction MUST use the grounded amounts (capped per FR-MC-002). An ingredient that matches an owned item but has no usable amount is decremented by one unit (legacy behaviour); an ingredient matching no item deducts nothing and is recorded as not consumed.
- **FR-MC-010**: Meal suggestions requested after a consumption (or its reversal) MUST reflect the updated inventory.
- **FR-MC-011**: Calendar entries existing before this feature MUST be treated as cooked at cutover (their deduction already occurred under the planning-time rule); such entries cannot be un-cooked.

**Consumption receipts & reversal (Story 3)**

- **FR-MC-012**: Every cooked confirmation MUST record a consumption receipt: each inventory item affected, the amount actually deducted from it, and a full snapshot of any item that the deduction depleted and removed.
- **FR-MC-013**: Un-marking a cooked entry MUST restore inventory exactly from its receipt — including recreating depleted-and-removed items with their previous details — atomically and idempotently, and return the entry to planned.
- **FR-MC-014**: Deleting a cooked entry MUST leave inventory unchanged (the consumption stands); deleting a planned entry likewise changes nothing. Undoing a mistaken cook is done by un-marking first.
- **FR-MC-015**: The detail view of a cooked entry MUST show what its cooking consumed from inventory.

**Quantity-aware groceries (Story 4)** *(closes spec 001 FR-027/FR-028; FR-026 remains the fallback)*

- **FR-MC-016**: Where grounded quantities exist, grocery-list generation MUST sum each ingredient's required amounts across the week's planned meals and net off the user's owned, non-expired stock, listing only the shortfall; an ingredient whose need is fully covered is omitted.
- **FR-MC-017**: Amounts in compatible units MUST be aggregated in a single canonical unit per line. Any line whose amounts cannot be reconciled (unknown or incompatible units, ungrounded meals) MUST fall back to the servings count (spec 001 FR-026) — list generation never fails over quantities.
- **FR-MC-018**: Expired owned stock MUST NOT be netted off the grocery need (consistent with spec 001 FR-008 — expired-but-owned ingredients are repurchased).
- **FR-MC-019**: Manually added grocery items, purchase check-offs, and regeneration behaviour MUST be preserved unchanged.

**Cascade**

- **FR-MC-020**: Spec 001 MUST be revised to match this spec: FR-005 re-stated as cook-time consumption (pointing here), FR-027/FR-028 un-deferred (pointing here), FR-026 marked as the fallback model, and the affected US3 acceptance scenarios updated — so both implementations build from a consistent contract.

### Key Entities

- **Calendar entry (meal-plan slot)**: gains a lifecycle state — planned or cooked — with the cooked time and, once cooked, a link to its consumption receipt.
- **Grounded ingredient**: a meal ingredient tied to a specific owned inventory item with an amount and unit, plus how it was resolved (direct reference, name similarity, learned pairing) — or explicitly not-from-inventory.
- **Consumption receipt**: the record written at cooked confirmation — per-item amounts actually deducted and full snapshots of items removed by depletion; the sole source for exact reversal.
- **Ingredient pairing memory**: per-user remembered mappings from ingredient names to that user's inventory items — a sibling of the learned alias memory introduced by spec 005, with the same user-scoping guarantees.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-MC-001**: 100% of from-inventory ingredients in delivered meal suggestions reference a real item owned by the requesting user, with a positive amount no greater than owned stock; zero cross-user references survive validation.
- **SC-MC-002**: Planning activity (add / move / replace / remove) produces zero inventory changes, measured over any sequence of calendar operations.
- **SC-MC-003**: Marking a meal cooked updates inventory by the grounded amounts exactly once — repeated or concurrent confirmations of the same entry never deduct twice.
- **SC-MC-004**: Cook followed by un-cook returns inventory to its exact prior state in 100% of cases, including items that consumption had depleted and removed.
- **SC-MC-005**: For a week with planned-but-uncooked meals, the generated grocery list computes needs against full owned stock (no double-count), and where quantities are grounded the netting is arithmetically exact (e.g. 500 g needed, 400 g owned, not expired → 100 g listed).
- **SC-MC-006**: A user can go from a planned calendar entry to confirmed-cooked, with inventory updated, in at most 2 interactions from the calendar.

## Assumptions

- **Depletion removes the item** (current behaviour is kept): consuming an item to zero removes it from inventory; the receipt's snapshot is what makes restore possible. Keeping a zero-quantity item instead would be a separate UX change and is out of scope.
- **Cap-at-owned is the shortfall rule**: when a meal needs more than is owned, the owned amount is consumed and the shortfall is a grocery concern, not a negative inventory.
- **The pairing memory builds on spec 005's learned-alias foundation** (same per-user scoping, FR-IQ-018 semantics) rather than introducing a parallel learning concept.
- **No semantic-search infrastructure**: ingredient resolution uses tiered deterministic matching plus bounded, cached assisted lookups — consistent with the standing architectural constraint against embedding/vector layers.
- **Suggestion quantity quality is best-effort**: grounded amounts come from the suggestion source and are validated/capped, not verified against real recipes; users see and implicitly correct them by cooking. Refinement loops are out of scope.
- **Cutover is one-way**: pre-existing entries become cooked; no attempt is made to reconstruct receipts for deductions that happened under the old rule.
- **Topology-agnostic contract**: this spec constrains behaviour, not architecture; it is authored on `main`, implemented first on `impl/nextjs`, and inherited by `impl/vite` on sync (implementation there deferred by standing decision).

## Out of Scope

- Serving-size scaling or partial-cook amounts (a cook consumes the meal's stated amounts, capped at owned stock).
- Nutrition tracking, cost tracking, or cooking-history analytics beyond the cooked state and receipts.
- Automatic cook detection (time-based or otherwise) — cooked is always an explicit user action.
- Editing a receipt after the fact (reversal is all-or-nothing via un-cook).
- A metric/imperial display preference (spec 001 Assumption 11 stays Phase 2+); unit handling here is aggregation-only.
- Shared/multi-user households — inventory, plans, receipts, and pairings remain single-user (FR-036).
- The grocery check-off → inventory flow (roadmap backlog #3) — it pairs with this feature but amends FR-032 and is specified separately.
