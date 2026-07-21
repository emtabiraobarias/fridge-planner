# Feature Specification: Daily Rolling Grocery-List Refresh

**Feature Branch**: `008-rolling-grocery-refresh`
**Created**: 2026-07-21
**Status**: Draft
**Input**: User description: "Daily rolling grocery-list refresh: the grocery list recomputes daily to reflect what is still missing from inventory given the remaining uncooked planned meals dated today onwards — meals before today are ignored entirely, whether cooked or uncooked (a skipped Tuesday dinner no longer generates shopping needs on Wednesday). Depends on spec 006's planned/cooked entry state (only planned entries count) and FR-MC-016 quantity netting; pairs with spec 007's check-off receipts. Amends spec 001's grocery generation FRs (FR-025/026)."

> **Relationship to prior specs:** completes the "live list" trio — cook → needs shrink (spec `006`), buy → inventory grows (spec `007`), day rolls over → stale meals drop out (**this spec**). Generated needs already net owned stock (FR-MC-016..018) and already count only `planned` (uncooked) entries; this spec adds the **date dimension**: entries dated before today stop contributing needs entirely, and the list stays current every time it is viewed.

## Clarifications

### Session 2026-07-22

- Q: When should the date-scoped recomputation happen? → A: Recompute on view — every open/regenerate evaluates against the current day; no background scheduler.
- Q: Whole-week list identity with past days excluded, or a rolling rest-of-week list? → A: **Rolling rest-of-week list** — the list the user works with always covers today through the end of the week, shedding days as they pass (supersedes the draft's whole-week-identity assumption).
- Q: What happens to purchased rows and manual items when days roll past? → A: **Shed everything with the day, anchored to the day of the action** — a row ticked purchased or added manually stays for the rest of that calendar day and sheds at the next midnight rollover; un-tick reversal is same-day only; after shed the purchase is final (the added stock stays in Kitchen inventory and nets off future needs).
- Q: Does a today-dated planned meal count toward needs all day, or drop out once its mealtime passes? → A: **Counts all day** — midnight boundary only; no sub-day mealtime semantics (consistent with FR-RG-010).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Past meals stop generating shopping needs (Priority: P1)

Mid-week, a user opens their grocery list. Meals that were planned for days already gone — whether they were cooked or skipped — no longer appear as shopping needs. A skipped Tuesday dinner does not tell the user to buy its ingredients on Wednesday: that meal's moment has passed, and buying for it now serves no purpose.

**Why this priority**: This is the feature's core value. Today the list is computed once from the whole week's plan, so every passed-but-uncooked meal inflates the list with dead needs — the user over-buys or loses trust in the list.

**Independent Test**: Plan meals across the week, let one or more planned days pass uncooked, open the grocery list — only ingredients needed by today-onwards planned meals are listed.

**Acceptance Scenarios**:

1. **Given** a week with a planned (uncooked) dinner dated yesterday and a planned dinner dated tomorrow, **When** the user views the grocery list today, **Then** only the tomorrow dinner's ingredients contribute generated needs; the yesterday dinner contributes nothing.
2. **Given** a grocery line sourced from two meals — one dated yesterday, one dated tomorrow — each needing 200 g of the ingredient, **When** the list refreshes today, **Then** the line's quantity reflects only the tomorrow meal's remaining shortfall (after netting owned stock), and the line's source-meal references list only the tomorrow meal.
3. **Given** a generated, unpurchased line whose source meals are now all dated before today, **When** the list refreshes, **Then** that line is removed.
4. **Given** a cooked meal dated yesterday, **When** the list refreshes today, **Then** it contributes nothing (same as any past meal — cooked or uncooked, before-today entries are ignored).
5. **Given** a week where every remaining today-onwards meal has been cooked, **When** the user views the list, **Then** no generated needs remain — only today's manually added items and today's purchased rows are shown.

---

### User Story 2 - Same-day purchase integrity, daily shed (Priority: P2)

Rows the user acts on — ticking an item purchased (adding it to their kitchen per spec `007`) or adding a manual item — stay on the list for the **rest of that calendar day**, then shed at the next midnight rollover. Within the day, refreshes never undo a purchase, detach its receipt, or delete a manual item; once the day rolls over, the list resets lean — the bought stock lives on in Kitchen inventory and nets off future needs, so nothing is asked to be bought twice.

**Why this priority**: The shed rule is what keeps the rolling list lean, but same-day integrity is what keeps the spec `007` purchase flow trustworthy — a mid-shop refresh must never corrupt a tick or its reversal.

**Independent Test**: Tick a generated item purchased and add a manual item; refresh repeatedly the same day — both rows persist, un-tick reverses exactly. After the day rolls over, both rows are gone, the purchased stock remains in inventory, and the list does not re-ask for it.

**Acceptance Scenarios**:

1. **Given** a manually added item, **When** the list refreshes any number of times that same day, **Then** the item remains unchanged; **When** the day rolls over, **Then** it sheds from the list.
2. **Given** a generated line ticked purchased (carrying its purchase receipt), **When** the list refreshes later that day — even if its source meal's date has meanwhile passed — **Then** the row remains, marked purchased with receipt intact.
3. **Given** a purchased row still on the list (same day), **When** the user un-ticks it, **Then** the reversal applies exactly as spec `007` requires (receipt-based), unaffected by intervening refreshes; **Given** the day has rolled over and the row has shed, **Then** the purchase is final — the added stock stays in inventory.
4. **Given** an ingredient ticked purchased earlier in the week (stock now in inventory, row since shed), **When** the list recomputes, **Then** the owned stock nets off the need — the list does not ask them to buy it again.

---

### User Story 3 - The list is current without manual regeneration (Priority: P3)

Whenever the user opens the grocery list — any day, any time — it already reflects today's date, the meals still ahead, what has been cooked, and what is in the kitchen. There is no "refresh" button to remember and no stale view to distrust.

**Why this priority**: The rolling behaviour only delivers value if it happens by itself. But it is P3 because a manual "regenerate" action applying the same date-scoped rules would already deliver most of US1/US2's value.

**Independent Test**: View the list, advance a day (or cook a meal / change inventory), reopen the list without any explicit action — the shown needs have updated.

**Acceptance Scenarios**:

1. **Given** the list was last computed yesterday, **When** the user opens the grocery page today, **Then** the shown needs reflect today's scope with no explicit user action.
2. **Given** the user forces a regeneration (existing action), **When** it completes, **Then** the result obeys the same today-onwards scope — manual and automatic refresh produce the same list.
3. **Given** a user viewing a future week's list, **When** it is computed, **Then** all of that week's planned meals count (all its dates are today or later).

---

### Edge Cases

- **Entirely past week**: once a week's days have all passed, the rolling list moves on to the current week; fully-past weeks are not browsable historical records (receipt integrity per FR-RG-005/011).
- **Day boundary**: "today" is the user's current calendar day; the boundary is midnight, consistent with how expiration already treats dates (an entry dated today still counts all day today).
- **Everything cooked or covered**: all remaining needs netted to zero → the generated portion of the list is empty; today's manual and purchased rows still display.
- **Mixed-source line partially in the past**: quantity shrinks to the remaining meals' shortfall; if unreconcilable units force the servings fallback, the servings count likewise counts only today-onwards planned meals.
- **Meal added for a past date** (user back-fills history): it is dated before today, so it never generates needs.
- **Refresh vs. mid-shop race**: a refresh occurring between a tick and an un-tick must not detach the receipt from its row (same-day preservation keys on the row, not on regeneration order).
- **Purchase near midnight**: a row ticked shortly before midnight sheds at the rollover minutes later; its reversal window ends with the day — an accepted consequence of the daily-reset rule (the inventory addition is unaffected).
- **Manual item meant for later in the week**: manual items are day-scoped "buy today" notes; something needed on a future day is either re-added that day or arises from generation once its meal is in scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-RG-001**: Generated grocery needs MUST be computed only from meal-plan entries that are both **uncooked (`planned`)** and **dated today or later** within the list's week. Entries dated before today MUST be excluded regardless of their cooked state.
- **FR-RG-002**: The date scope MUST be evaluated against the current calendar day **every time the list is viewed or regenerated** — the shown list always reflects today's scope without requiring an explicit user action. *(Refresh mechanism decision: recompute at view time; no scheduled background regeneration is required.)*
- **FR-RG-003**: Within the reduced scope, quantity netting MUST follow the existing rules unchanged: sum grounded needs across counted meals, net off owned non-expired stock (spec `006` FR-MC-016..018), and fall back to the servings count (spec `001` FR-026) where quantities cannot be reconciled — with the servings count likewise counting only in-scope meals.
- **FR-RG-004**: Manually added items MUST persist unchanged through every refresh during the calendar day they were added — never removed, re-quantified, or re-sourced by recomputation — and MUST shed from the rolling list at the next day rollover. *(Revises spec `001` FR-030 / spec `006` FR-MC-019 preservation to day-scoped.)*
- **FR-RG-005**: Rows marked purchased (carrying a spec `007` purchase receipt) MUST persist with receipt intact through every refresh during the calendar day they were purchased — even if their source meals' dates pass meanwhile — and MUST shed at the next day rollover. After shedding, the purchase is final: the added inventory is untouched by the shed, and un-tick is no longer offered.
- **FR-RG-006**: A generated, unpurchased row whose recomputed remaining need is zero (source meals passed or cooked, or need fully covered by stock) MUST be removed from the list.
- **FR-RG-007**: A generated, unpurchased row still partially needed MUST have its quantity and source-meal references updated to reflect only in-scope meals.
- **FR-RG-008**: The grocery list MUST present as a **rolling rest-of-week list**: at any moment it covers today through the end of the current week, shedding days as they pass. The check-off flows (spec `007`) operate on this rolling list.
- **FR-RG-009**: Once a week has fully passed, the rolling list MUST move on to the current week — fully-past weeks are not maintained as browsable historical records. *(Retention of purchase receipts for reversal integrity is governed by FR-RG-005/011.)*
- **FR-RG-010**: "Today" MUST mean the user's current calendar day with a midnight boundary — an entry dated today remains in scope for the whole of today — consistent with the existing midnight-cutoff date semantics.
- **FR-RG-011**: The spec `007` check-off flows (tick add/merge, un-tick reversal, receipt-aware checkout) MUST operate unchanged on rows present on the rolling list; within a day, refreshing MUST never detach a receipt from its row. Un-tick reversal is available only while the purchased row remains on the list (same day, per FR-RG-005). Shedding MUST never cause a covered need to be re-listed (the purchased stock nets off per FR-RG-003).
- **FR-RG-012**: Spec `001` MUST be revised to match this spec: FR-025 re-stated as date-scoped rolling generation (pointing here), FR-026's aggregation noted as operating on the in-scope meal set, and FR-030/FR-031 annotated with the day-scoped persistence / same-day reversal window — so both implementations build from a consistent contract.

### Key Entities

- **Grocery list (weekly)**: the single per-week shopping list; retains its week identity while its generated content now depends on the viewing date.
- **Grocery line item**: either generated (from in-scope planned meals, removable/re-quantifiable by refresh) or manually added / purchased (refresh-immutable within their day, shed at the next rollover); purchased lines carry a purchase receipt (spec `007`) and are anchored to their purchase day.
- **Meal-plan entry**: dated, with a cooked/planned state (spec `006`); contributes needs only while planned **and** dated today or later.
- **Kitchen inventory**: owned stock netted off needs (non-expired only); grows via check-off (spec `007`), shrinks via cooking (spec `006`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-RG-001**: 100% of meals dated before the current day contribute zero items and zero quantity to the grocery list shown that day, whether cooked or skipped.
- **SC-RG-002**: A user opening the grocery list on any day of the week sees needs consistent with that day's remaining planned meals without performing any refresh action — zero manual steps.
- **SC-RG-003**: Within a calendar day, 100% of manually added items and purchased rows (with receipts) survive any number of refreshes unchanged; at the next day rollover, 100% of them shed from the rolling list while the purchased inventory remains intact.
- **SC-RG-004**: After cooking a meal or ticking a purchase, the next view of the grocery list reflects the reduced need — no stale needs persist beyond one view cycle.
- **SC-RG-005**: Un-ticking a purchase the same day reverses exactly per its receipt regardless of how many refreshes occurred since the tick — zero reversal drift; after the row sheds, the purchase is final with zero inventory disturbance.

## Assumptions

- **Refresh mechanism**: recompute at view time is sufficient — the list is already generated lazily on first view, so extending that to date-scoped recomputation requires no scheduled job. A background daily regeneration is explicitly out of scope.
- **Rolling rest-of-week list** *(clarified 2026-07-22, replacing the draft's whole-week-identity assumption)*: the user-facing list always spans today → end of week and sheds passed days (FR-RG-008); fully-past weeks are not browsable records (FR-RG-009). How the rolling view is realised over the existing week-keyed storage is a design decision for the plan phase.
- **Daily-reset tradeoffs accepted** *(clarified 2026-07-22)*: a purchase can be un-ticked only on the day it was made (after that it is final — correctable via normal Kitchen inventory editing); manual items are day-scoped notes, not week-long todos. Both are deliberate leanness choices; receipts may be retained in storage after shedding, but no user-facing history view is required.
- **"Today" source**: the user's current calendar day with a midnight boundary, matching the app's existing expiry-date semantics. Sub-day granularity (meal type vs. time of day — e.g. breakfast already eaten by evening) is deliberately out of scope: a same-day meal counts all day.
- **Cooked exclusion is inherited, not new**: spec `006` already limits generation to `planned` entries; this spec adds only the date dimension and re-states the combined rule for clarity.
- **Legacy entries**: pre-`006` entries with no cooked/planned state read as `cooked` (spec `006` FR-MC-011) and therefore already contribute no needs; no additional migration is required.

## Dependencies

- **Spec `006` (meal consumption)**: planned/cooked entry state (FR-MC-010..011) and quantity netting (FR-MC-016..018) — both shipped.
- **Spec `007` (grocery check-off)**: purchase receipts and receipt-aware checkout (FR-GC-001..014) — shipped.
- **Spec `001` cascade**: FR-025/FR-026 revisions per FR-RG-012, authored on `main` alongside this spec.
