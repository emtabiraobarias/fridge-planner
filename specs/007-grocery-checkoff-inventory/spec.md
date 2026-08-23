# Feature Specification: Grocery Check-Off Flows Into Kitchen Inventory

**Feature Branch**: `007-grocery-checkoff-inventory`
**Created**: 2026-07-18
**Status**: Draft
**Input**: User description: "Grocery check-off flows into kitchen inventory — checking an item 'bought' adds it to inventory immediately (atomic idempotent purchase transition, purchase receipt stored on the grocery item); un-checking reverses exactly via the receipt; FR-032 bulk checkout becomes 'mark remaining + finalize' and skips already-added items; location defaulted via the ingredient categorizer with optional expiry suggestion from the spec-005 alias memory; duplicate handling merges quantities into an existing same-name item (EC-03 semantics). Amends spec 001 FR-032; pairs with spec 006 to close the buy→cook loop."

> **Relationship to earlier specs:** this spec **amends spec 001 FR-031/FR-032** — checking an item off is no longer display-only, and the bulk checkout becomes "mark remaining + finalize". It is the purchase-side mirror of **spec 006**: purchase receipts mirror consumption receipts (exact reversal, atomic idempotent transitions, suggestion-freshness on inventory change), and it reuses **spec 005**'s per-user alias memory (learned units, expiry observations) for inference. Together with 006 it closes the kitchen loop: **buy → inventory ↑ (this) · cook → inventory ↓ (006)**.

## Clarifications

### Session 2026-07-18

- Q: What inventory item does a checked-off servings-model line (e.g. "Milk ×3") create, given it has no real-world unit? → A: **Hybrid** — quantity = the servings count with a **quickly inferable** unit (an existing same-name inventory item's unit, else the user's learned alias unit) added with **no prompt**; only **ambiguous** lines (no confident inference) get a small pre-filled quick prompt. Real-amount lines (spec 006 grounded shortfalls) always map 1:1 with no prompt.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Checked off means it's in my kitchen (Priority: P1)

Standing in the store, the user ticks a grocery line as bought — and that's it: the item is **in their kitchen inventory immediately**. Today the tick is cosmetic; inventory is only touched by the separate "Done shopping" checkout, so a mid-shop tick never reaches the Kitchen, and skipping checkout loses the additions entirely.

**Why this priority**: This is the gap itself — the one-tap purchase-to-inventory flow is the feature. Everything else refines or reverses it.

**Independent Test**: Seed a grocery list, tick a line, verify the inventory item exists with the right quantity/unit/category/location — no checkout involved; tick twice (double-tap/retry) and verify a single add.

**Acceptance Scenarios**:

1. **Given** a real-amount grocery line "Mince — 100 g" (spec 006 grounded shortfall), **When** the user ticks it bought, **Then** inventory gains exactly 100 g of Mince, with the category from the list line and the location defaulted from the category mapping.
2. **Given** a servings line "Milk ×3" and an existing inventory item "Milk" in a compatible context, **When** ticked, **Then** the existing item's quantity increases by 3 in its own unit (merge, EC-03) — no duplicate "Milk" item is created.
3. **Given** a servings line "Tortillas ×2", no existing tortillas item, and a learned alias unit "pack" for tortillas (spec 005 memory), **When** ticked, **Then** a new item "Tortillas, 2 pack" is created without any prompt.
4. **Given** the tick request is submitted twice (double-tap, retry, flaky store Wi-Fi), **When** both arrive, **Then** inventory is added to exactly once.
5. **Given** a tick succeeded, **When** the user views the grocery line, **Then** it shows as purchased and remembers what it added (its purchase receipt), enabling exact reversal.
6. **Given** only an **expired** same-name inventory item exists, **When** a line is ticked, **Then** a NEW item is created rather than merging into the expired one (fresh purchase ≠ expired stock, spec 001 FR-008 spirit).
7. **Given** a manually-added grocery line, **When** ticked, **Then** it behaves identically (manual lines are not second-class).

---

### User Story 2 - Un-tick actually un-buys (Priority: P2)

Mis-ticked the wrong line, or put the item back on the shelf? Un-checking reverses the inventory effect **exactly**: the quantity the tick added is removed, or the item it created is deleted — using the line's purchase receipt, never guesswork.

**Why this priority**: Reversibility is what makes one-tap adds safe; without it every mis-tap becomes inventory corruption (the same argument as spec 006's un-cook).

**Independent Test**: Tick a line (verify the add), un-tick it, verify inventory is exactly as before; repeat with an intervening consumption and verify the clamped behaviour.

**Acceptance Scenarios**:

1. **Given** a tick that created a new item, **When** un-ticked, **Then** that item is removed and the line returns to unpurchased.
2. **Given** a tick that merged 3 into an existing item, **When** un-ticked, **Then** exactly 3 is decremented from it.
3. **Given** the added stock was partly consumed in between (e.g. cooked via spec 006), **When** un-ticked, **Then** the reversal is clamped at what remains — inventory never goes negative — and the line still returns to unpurchased.
4. **Given** the added item was deleted entirely in between, **When** un-ticked, **Then** inventory is untouched and the line still returns to unpurchased (the reversal never blocks the toggle).
5. **Given** an un-tick is submitted twice, **When** both arrive, **Then** inventory is reversed exactly once.

---

### User Story 3 - A quick prompt only when the app can't infer (Priority: P3)

For the rare line where the app has no confident quantity/unit inference (a servings line with no existing same-name item and no learned unit), ticking opens a **small pre-filled prompt** — quantity pre-filled with the servings count, unit with a neutral default, plus the location default and a one-tap expiry suggestion when the user has an established pattern (spec 005 memory). Accepting the defaults is one tap; cancelling leaves the line unticked.

**Why this priority**: It keeps the P1 flow one-tap for the common case while preventing garbage data for the ambiguous one — per the session clarification.

**Independent Test**: Tick a servings line with no inference source → prompt appears pre-filled; accept → item created with the entered values; cancel → line stays unpurchased and inventory untouched. Tick an inferable line → no prompt.

**Acceptance Scenarios**:

1. **Given** a servings line with no same-name inventory item and no learned unit, **When** ticked, **Then** the quick prompt appears with quantity = the servings count and a neutral unit pre-filled; confirming applies exactly the (possibly adjusted) values.
2. **Given** the prompt is open, **When** the user cancels, **Then** the line remains unpurchased and inventory is untouched.
3. **Given** the user has an established expiry pattern for the item, **When** the prompt renders, **Then** a one-tap expiry suggestion is offered and applied **only on tap** (spec 005 FR-IQ-017 semantics); auto-added lines (Story 1) never receive an expiry silently.
4. **Given** the user adjusts the unit in the prompt, **When** confirmed, **Then** the correction feeds the alias memory as the learned unit for future ticks (spec 005 FR-IQ-015 semantics).

---

### User Story 4 - Checkout finalizes what's left (Priority: P4)

"Done shopping" no longer re-adds everything: it adds only the lines that were **not** already ticked into inventory (using the same mapping rules, without per-item prompts), marks the list complete, and never double-adds a line that a mid-shop tick already handled.

**Why this priority**: Keeps the existing bulk flow working for users who don't tick as they go, while making the two paths compose — the revised spec 001 FR-032.

**Independent Test**: Tick 2 of 4 lines mid-shop, then checkout; verify the 2 remaining lines are added once each, the 2 ticked lines are not re-added, and the list is complete.

**Acceptance Scenarios**:

1. **Given** a list where some lines carry purchase receipts (ticked) and some don't, **When** the user completes shopping, **Then** only receipt-less lines are added to inventory, each exactly once, and the whole list is marked complete.
2. **Given** an ambiguous servings line reached checkout un-ticked, **When** the bulk completion runs, **Then** it is added with the inference defaults (count + neutral/learned unit) — bulk completion never prompts per item.
3. **Given** a completed list, **When** viewed, **Then** ticked lines and checkout-added lines are indistinguishable in effect (all purchased, all in inventory).

---

### Edge Cases

- Two devices tick the same line concurrently: the atomic unpurchased→purchased transition admits exactly one add; the loser sees the line already purchased.
- The same product appears as two lines (e.g. a grounded "Mince — 100 g" and a manual "mince"): each line carries its own receipt; both may merge into the same inventory item, and reversal per line removes only that line's contribution.
- Un-tick after the list was completed: out of scope — completion finalizes the trip (see Assumptions).
- A merge-target item's unit is incompatible with a real-amount line (e.g. line in g, item in L): create a new item rather than corrupt the merge (compatible-unit merges only).
- Meal suggestions after ticking: inventory changed outside the inventory screen — suggestions requested afterwards MUST reflect the additions (the spec 006 FR-MC-010 freshness rule applies to purchases too).
- Cross-user isolation (FR-036) holds: receipts, merges, and reversals only ever touch the requesting user's data.

## Requirements *(mandatory)*

### Functional Requirements

**Immediate add at check-off (Story 1)** *(amends spec 001 FR-031)*

- **FR-GC-001**: Marking a grocery line purchased MUST add its goods to the user's inventory immediately, as part of the same action — not at checkout time.
- **FR-GC-002**: The unpurchased→purchased transition MUST be atomic and idempotent: however many times it is submitted, inventory is added to exactly once.
- **FR-GC-003**: Every add MUST record a purchase receipt on the grocery line: the inventory item affected, the quantity and unit added, and whether it was merged into an existing item or created new — the sole source for exact reversal.
- **FR-GC-004**: Amount mapping MUST be: real-amount lines add exactly their quantity and unit; servings lines add the servings count with the first confident unit inference — (1) an existing same-name, non-expired inventory item's unit (merge), (2) the user's learned alias unit — and with no confident inference the line is ambiguous (Story 3).
- **FR-GC-005**: Duplicate handling (EC-03): when a same-name, non-expired inventory item with a compatible unit exists, the add MUST merge (sum quantities) rather than create a duplicate; expired or unit-incompatible items are never merge targets — create new instead.
- **FR-GC-006**: New items MUST default their location from the category→location mapping; no expiry is ever applied without an explicit user action.

**Exact reversal (Story 2)**

- **FR-GC-007**: Un-marking a purchased line MUST reverse exactly per its receipt — decrement the added quantity or remove the created item — atomically and idempotently, clamped at live stock (never negative).
- **FR-GC-008**: The purchase state MUST clear even when there is nothing left to reverse (stock consumed or item deleted in between); reversal never blocks or errors the toggle.

**Quick prompt for ambiguous lines (Story 3)**

- **FR-GC-009**: An ambiguous servings line MUST present a pre-filled quick prompt (quantity = servings count, neutral unit default, location default) before adding; accepting the defaults takes at most one confirmation tap; cancelling leaves the line unpurchased and inventory untouched.
- **FR-GC-010**: The prompt MUST offer the alias-memory expiry suggestion where an established pattern exists, applied only on tap; unit corrections confirmed in the prompt MUST feed the user's learned alias unit.

**Checkout revision (Story 4)** *(amends spec 001 FR-032)*

- **FR-GC-011**: Completing shopping MUST add only lines without a purchase receipt (each via the FR-GC-004/005/006 rules, ambiguous lines using their defaults without prompting), mark all lines purchased, and finalize the list — a line already added at check-off is never added again.

**Cross-cutting**

- **FR-GC-012**: Meal suggestions requested after a check-off add or reversal MUST reflect the updated inventory (spec 006 FR-MC-010 semantics).
- **FR-GC-013**: All operations are scoped to the authenticated user (FR-036) — receipts, merges, and reversals never touch another user's data.
- **FR-GC-014**: Spec 001 MUST be revised to match: FR-031 (check-off has inventory effect) and FR-032 (checkout = mark remaining + finalize) re-stated with pointers here, and the affected US3 shopping scenarios updated.

### Key Entities

- **Grocery line (extended)**: gains a **purchase receipt** — the inventory item it added to, the quantity/unit added, and merged-vs-created — present iff the line was ticked through the new flow.
- **Purchase receipt**: the exact-reversal record (mirror of spec 006's consumption receipt, purchase-side).
- **Alias memory (spec 005, reused)**: supplies learned units for inference and expiry suggestions in the prompt; corrections flow back into it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-GC-001**: A ticked line's goods are in inventory within the same interaction, exactly once — repeated or concurrent ticks of one line never double-add (0 duplicates).
- **SC-GC-002**: Tick followed by un-tick returns inventory to its exact prior state in 100% of cases where the stock was untouched in between; with intervening consumption, reversal is clamped and never produces negative quantities.
- **SC-GC-003**: Mid-shop ticks survive a skipped checkout: 100% of ticked lines are in inventory even if "Done shopping" is never pressed (the original gap, closed).
- **SC-GC-004**: The common case stays one tap: lines with a confident inference add with zero additional interactions; ambiguous lines take at most 2 more (prompt + confirm).
- **SC-GC-005**: A trip mixing N mid-shop ticks and a final checkout produces exactly one inventory addition per line — never a double-add.

## Assumptions

- **Completion finalizes the trip**: un-ticking after "Done shopping" is out of scope; the list is complete and further corrections happen in the Kitchen (inventory edit).
- **Line-level all-or-nothing**: a tick buys the whole line's quantity; partial purchases are corrected via the prompt (ambiguous path) or later inventory edit.
- **Neutral unit default** for promptless fallbacks at bulk checkout is the app's count-style unit; the prompt (Story 3) is where users refine it, and their corrections teach the alias memory.
- **Receipts are small** (one per line) and live on the grocery line, mirroring spec 006's embedded-receipt decision.
- **Expired stock is never a merge target** — consistent with spec 001 FR-008 (expired-but-owned repurchased as new).
- **Topology-agnostic contract**: authored on `main`, implemented first on `impl/nextjs`, inherited by `impl/vite` on sync (deferred by standing decision).

## Out of Scope

- Price/cost tracking, store metadata, or shopping analytics.
- Un-check after list completion (see Assumptions).
- Changing spec 006 consumption semantics (this is the purchase-side mirror; the two receipts stay independent).
- The daily rolling grocery-list refresh (roadmap backlog #4 — separate spec).
- Barcode scanning or any new input modality.
- The `impl/vite` implementation (deferred by decision).
