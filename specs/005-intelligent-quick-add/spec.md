# Feature Specification: Intelligent Quick-Add Understanding

**Feature Branch**: `005-intelligent-quick-add`
**Created**: 2026-07-17
**Status**: Draft
**Input**: User description: "Intelligent inventory quick-add understanding — make the natural-language quick-add reliably extract name / quantity+unit / expiry / location from free text (roadmap priority-backlog #1; analysis 2026-07-16 against the quick-add parser and spec 004 design/reference-logic.md)"

> **Relationship to spec 004:** the natural-language quick-add and its parsing algorithm were introduced by spec 004 (Organic redesign) and are canonically documented in `specs/004-organic-redesign/design/reference-logic.md` §1. This spec **extends and supersedes that algorithm's behaviour** for both entry points that share it — the Kitchen (inventory) quick-add and the Groceries quick-add. On completion, spec 005 becomes the canonical definition of quick-add understanding; 004's reference logic remains valid for everything it covers that this spec does not amend (expiry labelling, steppers, placement flow, toast).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Say it once, in plain words (Priority: P1)

A user types a single natural phrase — for example "500 grams mince in the freezer use by 20/7" or "milk 2L, 6 eggs, sourdough" — and the quick-add extracts the item name, quantity with unit, storage location, and expiry date correctly, without the user having to know any special keywords, word order, or abbreviations.

Today the parser fails on common phrasings: a stated location is ignored and pollutes the name ("chicken in the freezer" → "Chicken In The Freezer", stored in the fridge); spelled-out units corrupt the name ("500 grams mince" → item named "Grams Mince"); expiry is only understood after the literal words "expires"/"exp" (not "use by", "best before", "today", "tomorrow", or month names); a past day/month date is placed in the current year (already expired) instead of rolling forward; quantity is only understood at the start of the phrase ("milk 2L" ignores the 2L); and only one item can be added per submission.

**Why this priority**: This is the core promise of the feature — the smart quick-add is the primary add flow on both the Kitchen and Groceries screens, and every misparse either pollutes inventory data (wrong names, wrong locations, missing expiry) or forces the user back into manual correction, eroding trust in the feature. Every other story builds on a parse worth correcting, remembering, or assisting.

**Independent Test**: Can be fully tested by typing a corpus of representative phrases into the quick-add on both screens and verifying each extracted field against expected values — no other story required.

**Acceptance Scenarios**:

1. **Given** the Kitchen quick-add, **When** the user types "chicken thighs in the freezer", **Then** the item is named "Chicken Thighs", the location is freezer, and no location words appear in the name.
2. **Given** the Kitchen quick-add, **When** the user types "500 grams mince", **Then** the item is named "Mince" with quantity 500 and unit g — spelled-out unit words are recognised as units, never absorbed into the name.
3. **Given** the Kitchen quick-add, **When** the user types "yogurt use by tomorrow", **Then** the expiry is set to tomorrow's date; the phrases "use by", "best before", and "expires" are all understood, as are the tokens "today", "tomorrow", weekday names, relative offsets (e.g. "3d", "2w"), day/month numerics, and day-with-month-name dates (e.g. "16 july").
4. **Given** today is 17 July, **When** the user types "ham expires 2/1", **Then** the expiry resolves to 2 January of the **next** year (a day/month earlier than today rolls forward), not a date in the past.
5. **Given** the Kitchen quick-add, **When** the user types "milk 2L", **Then** quantity 2 and unit L are extracted even though they trail the name.
6. **Given** the Kitchen quick-add, **When** the user types "milk 2L, 6 eggs, sourdough", **Then** three items are added in one submission, each parsed independently with its own name, quantity, and category.
7. **Given** an explicit location in the text that conflicts with the category's usual location (e.g. "bread in the freezer"), **When** the item is added, **Then** the explicit location wins (freezer), while the category guess (Grains) is unaffected.
8. **Given** the Groceries quick-add, **When** the user types any of the phrases above, **Then** the same parsing behaviour applies (shared understanding across both entry points).

---

### User Story 2 - See what was understood, fix it in a tap (Priority: P2)

Before confirming an add, the user sees the parsed interpretation as small editable chips (name, quantity+unit, category, location, expiry). Values the parser **read from the text** look confident; values it **guessed or defaulted** are visually distinguished. Tapping a chip lets the user correct that one field in place — without abandoning the quick-add for a full form.

**Why this priority**: No parser is perfect; the difference between a delightful and an infuriating quick-add is whether a near-miss costs one tap or a trip to an edit form. Confidence styling also teaches users what the parser understood, making Story 1's capabilities discoverable.

**Independent Test**: Can be tested on top of the existing parser alone — type a phrase, verify the preview distinguishes parsed vs guessed fields, tap a chip, change the value, and confirm the corrected value is what gets saved.

**Acceptance Scenarios**:

1. **Given** the user has typed "spinach", **When** the preview renders, **Then** the category chip (Produce) and location chip (fridge) are visibly marked as guesses, while the name chip is confident.
2. **Given** a rendered preview, **When** the user taps the location chip and picks "pantry", **Then** the preview updates and the item is saved with location pantry.
3. **Given** a multi-item input (Story 1, scenario 6), **When** the preview renders, **Then** each item has its own chip row and each can be corrected independently.
4. **Given** a preview with a correction applied, **When** the user edits the underlying text again, **Then** re-parsing does not silently discard the user's explicit correction for a field the new text does not mention.

---

### User Story 3 - It learns my kitchen (Priority: P3)

When a user corrects a parse (e.g. always moving "tortillas" to the pantry, or always buying "oat milk" in litres), the system remembers that correction for that user. The next time the same item name appears, the remembered category, location, and unit apply automatically — and if the user has an established shelf-life pattern for the item, the preview offers a one-tap expiry suggestion (e.g. "expires in ~5 days?").

**Why this priority**: Deterministic rules can never cover every household's items and habits. Learning from corrections converts every Story 2 interaction into permanent personalisation, and expiry suggestions attack the biggest data gap in the inventory (items added without any expiry).

**Independent Test**: Correct an item's category/location/unit once, add the same item name again, and verify the remembered values apply (marked as learned/guessed, still correctable); verify another user's account is unaffected.

**Acceptance Scenarios**:

1. **Given** the user previously corrected "tortillas" from fridge to pantry, **When** they later type "tortillas", **Then** the preview shows location pantry (marked as learned, not confident-parsed).
2. **Given** a learned location for "tortillas" (pantry), **When** the user types "tortillas in the freezer", **Then** the explicit text wins over the learned value (freezer).
3. **Given** the user has repeatedly set ~5-day expiries on "salad mix", **When** they type "salad mix" with no expiry, **Then** the preview offers a suggested expiry the user can accept with one tap — it is not applied without that tap.
4. **Given** user A's learned aliases, **When** user B adds the same item names, **Then** user B sees only built-in behaviour — learned data is strictly per-user (FR-036 isolation).

---

### User Story 4 - AI assist for the hard cases (Priority: P4)

When the deterministic parser has low confidence in an input (e.g. an item it cannot categorise, or phrasing it cannot decompose), the system may consult an AI assistant to interpret the text. The assistant's interpretation is constrained to the app's existing categories, locations, and units, is presented as a guess (correctable per Story 2), and never delays or blocks the add — if assistance is unavailable or slow, the deterministic result stands.

**Why this priority**: A safety net for the long tail after deterministic rules (Story 1) and personal memory (Story 3) have done their work. Valuable, but optional — the feature is complete and useful without it, and it is the only story with an external dependency and operating cost.

**Independent Test**: With assistance enabled, type an input the deterministic parser cannot categorise and verify an improved, enum-valid interpretation appears as a guess; with assistance disabled or unreachable, verify the deterministic behaviour is untouched and no error is surfaced.

**Acceptance Scenarios**:

1. **Given** an input the deterministic parser classifies with low confidence (e.g. "gochujang"), **When** assistance is enabled, **Then** the preview may upgrade to an assisted interpretation whose category, location, and unit are all valid existing values, visually marked as a guess.
2. **Given** assistance is disabled, unreachable, or slow, **When** the user adds any item, **Then** the deterministic result is used, the add is never blocked or delayed beyond the normal experience, and no error is shown.
3. **Given** an assisted interpretation, **When** it disagrees with something explicitly stated in the user's text, **Then** the explicitly stated value wins.
4. **Given** repeated identical low-confidence inputs, **When** assistance is consulted, **Then** the system avoids redundant repeat consultations for the same text (the user experience stays instant and operating cost stays bounded).

---

### Edge Cases

- **Location word as item identity**: "frozen peas" must keep "Frozen Peas"-style naming behaviour (the word "frozen" is part of the item, and the Frozen category guess already maps to freezer) — only explicit location phrases ("in the freezer", "freezer:") are stripped, not category keywords.
- **Unit word that is also a container noun**: "1 can crushed tomatoes" — "can" is a recognised unit; "a can of beans" (no leading digit) should still yield a sensible name rather than a corrupted one.
- **Expiry keyword with unresolvable token**: "cheese expires someday" — the unrecognised token leaves expiry unset and must not corrupt the name (the unparsed clause is either kept in the name or cleanly dropped, but never half-stripped).
- **"expires today"**: resolves to today (item immediately shows as expiring), unlike weekday-name tokens which always mean a future occurrence.
- **Multi-item input with per-item details**: "2L milk expires friday, 500g mince, bread in the freezer" — each segment carries only its own quantity/expiry/location.
- **Empty or nameless segments in multi-item input**: "milk,, 12," — empty segments and bare-number segments are skipped; the valid items still add.
- **Decimal and compact quantities**: "1.5kg chicken", "6x eggs", "eggs x6" all extract quantity and unit correctly.
- **Conflicting signals**: explicit text beats learned alias beats AI assist beats built-in guess — one precedence order, applied per field.
- **Learned alias for a renamed/deleted item**: aliases key on the item name as typed, so stale aliases must never block or corrupt a parse — they only supply defaults.
- **Assistance returning an invalid value**: any assisted value outside the existing category/location/unit sets is discarded field-wise; the deterministic value for that field stands.

## Requirements *(mandatory)*

### Functional Requirements

**Deterministic understanding (US1)**

- **FR-IQ-001**: The quick-add parser MUST recognise explicit storage-location phrases in the input (at minimum: each valid location name, optionally preceded by "in the"/"in"/"to the"), set the item's location accordingly, and remove the phrase from the item name. An explicit location MUST override any category-derived location default.
- **FR-IQ-002**: The parser MUST recognise spelled-out and variant unit words (at minimum: gram/grams, kilogram/kilograms/kilo/kilos, litre/litres/liter/liters, millilitre/millilitres, piece/pieces, packet/packets, tin/tins, bottle/bottles, plus the existing abbreviations) and normalise each to its canonical unit — an existing canonical unit where one fits (e.g. tin → can), or a new canonical display unit where none does (e.g. bottle). A word recognised as a unit MUST never remain part of the item name; a word that is not a recognised unit MUST never be treated as one.
- **FR-IQ-003**: The parser MUST understand expiry clauses introduced by "expires", "exp", "use by", "use-by", and "best before" (case-insensitive), with date tokens covering at minimum: "today", "tomorrow", weekday names (next occurrence, ≥3-character prefix), relative offsets (Nd/Nw), day/month numerics (dd/mm), and day + month-name forms (e.g. "16 july", "jul 16").
- **FR-IQ-004**: A day/month date that has already passed in the current year MUST resolve to that date in the following year.
- **FR-IQ-005**: The parser MUST recognise a quantity (+ optional unit) in trailing position (e.g. "milk 2L", "eggs x6") as well as the existing leading position. When both appear, the leading value wins.
- **FR-IQ-006**: The quick-add MUST accept multiple items in one submission, separated by commas (and equivalent list separators), parsing each segment independently; empty and nameless segments are skipped without failing the whole input.
- **FR-IQ-007**: All parsing improvements MUST apply identically to both quick-add entry points (Kitchen inventory and Groceries), which share one parsing behaviour.
- **FR-IQ-008**: Parsing MUST remain instantaneous for the deterministic result (no network round-trip required), preserving the as-you-type preview.
- **FR-IQ-009**: The canonical parser definition (spec 004 `design/reference-logic.md` §1) MUST be revised to match this spec's behaviour, including a worked-example corpus covering every FR above, so both implementations can be built and tested from the document alone.

**Correctable preview (US2)**

- **FR-IQ-010**: Before an item is added, the quick-add MUST present the parsed interpretation as per-field chips: name, quantity + unit, category, location, and expiry (when set or suggested).
- **FR-IQ-011**: Each chip MUST visually distinguish its provenance: read from the user's text (confident) versus guessed/defaulted/learned/assisted (tentative).
- **FR-IQ-012**: Users MUST be able to correct the category, location, unit, quantity, and expiry via the preview (tap a chip → pick or enter a replacement) before adding; the corrected value is what gets saved.
- **FR-IQ-013**: In a multi-item submission, each item MUST have its own preview and corrections.
- **FR-IQ-014**: A user's explicit chip correction MUST survive re-parsing while the underlying text still produces the same value for that field; it MUST NOT be silently discarded.

**Personal learning (US3)**

- **FR-IQ-015**: When a user corrects a parsed field (category, location, or unit) for an item name, the system MUST remember the correction for that user and apply it to future parses of the same item name, marked as tentative (learned) provenance.
- **FR-IQ-016**: Learned values MUST rank below explicit text and above built-in guesses in the field-precedence order (explicit text > learned alias > AI assist > built-in guess/default).
- **FR-IQ-017**: When a user has an established expiry pattern for an item name, the preview MUST offer a one-tap expiry suggestion; the suggestion MUST NOT be applied without the user's tap.
- **FR-IQ-018**: Learned data MUST be scoped to the authenticated user (per FR-036) — never shared across users, and never able to block or corrupt a parse (it only supplies default values).

**Assisted understanding (US4)**

- **FR-IQ-019**: When the deterministic parse has low confidence (at minimum: the item could not be categorised beyond the fallback category), the system MAY consult an AI assistant to produce a better interpretation.
- **FR-IQ-020**: Assisted values MUST be validated against the existing category, location, and unit sets; any value outside them is discarded field-wise. Assisted values are tentative provenance and never override explicit text or learned aliases.
- **FR-IQ-021**: Assistance MUST be fail-open and non-blocking: when disabled, unreachable, or slow, the deterministic result is used with no user-visible error and no added delay to the add flow.
- **FR-IQ-022**: The system MUST bound assistance cost: repeated identical inputs MUST NOT trigger redundant repeat consultations, and consultation volume per user MUST be limited.

### Key Entities

- **Parsed item preview**: the interpretation of one input segment — name, quantity, unit, category, location, expiry — where each field carries a provenance (explicit / learned / assisted / guessed-default) that drives confidence styling and precedence.
- **User alias memory entry**: a per-user record keyed by item name as typed, holding remembered category, location, preferred unit, and an observed typical shelf-life; created/updated by corrections and repeated adds, read at parse time to supply learned defaults.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-IQ-001**: 100% of the worked-example corpus in the revised canonical parser document (covering every FR-IQ-001..006 behaviour) parses to exactly the specified fields.
- **SC-IQ-002**: A user can add a fully specified item — name, quantity + unit, location, and expiry — by typing one natural phrase and confirming, with zero form fields opened, on both the Kitchen and Groceries screens.
- **SC-IQ-003**: Correcting any single misparsed field takes at most 2 taps from the preview (open chip + choose value), without leaving the quick-add.
- **SC-IQ-004**: After a user corrects an item's category/location/unit once, re-typing the same item name applies the corrected values automatically with no repeat correction needed.
- **SC-IQ-005**: The as-you-type preview keeps its current responsiveness — deterministic interpretation appears with no perceptible delay — and enabling AI assistance never delays or blocks confirming an add.
- **SC-IQ-006**: Zero saved items contain unit words, location phrases, or expiry clauses embedded in the item name for any input in the corpus (the "Grams Mince" class of defect is eliminated).

## Assumptions

- **Scope pairing with the roadmap**: the four user stories correspond to the four scope tiers queued in the roadmap (2026-07-16 analysis). P1 alone is a shippable MVP; P2–P4 are each independently valuable increments. Whether P3/P4 ship in the first implementation round is a planning decision, not a spec question.
- **Category and Location enums are unchanged**: this feature maps free text onto the existing category and location sets and adds no new enum values. Units are a free-form display vocabulary (not a server-enforced enum): unit synonyms normalise to an existing canonical unit where one fits, and the recognised-unit vocabulary MAY gain a new canonical entry where none does (e.g. bottle).
- **Expiry suggestions are opt-in per add** (one tap to accept) because a wrong auto-set expiry corrupts the freshness signals that drive the use-soon strip and meal recommendations — worse than no expiry.
- **Precedence order** (explicit text > learned alias > AI assist > built-in guess) is fixed by this spec and applies per field, not per item.
- **AI assistance is deployment-optional**: environments without an assistant configured get Stories 1–3 at full fidelity; Story 4 requirements apply only where assistance is enabled.
- **Learned aliases key on the item name as the user types it** (case-insensitive); linking aliases across synonyms of the same product is out of scope.
- **Multi-item separators**: comma is the required separator; other list separators (e.g. " and ", newlines) may be supported but only the comma behaviour is contractually required.
- **No server-contract change is implied by P1/P2**: like spec 004, deterministic parsing and preview correction produce payloads the existing add flows already accept. P3 (per-user memory) and P4 (assistance) introduce new user-scoped capabilities whose shape is a planning concern.

## Out of Scope

- Voice input, barcode/receipt scanning, or photo recognition.
- Cross-user or global learning (shared alias dictionaries, community corrections).
- New categories, locations, or units; localisation of the parsing vocabulary beyond English.
- Changing what happens after an item is added (duplicate-merge behaviour, inventory semantics, grocery checkout — see roadmap backlog #2/#3).
- Parsing inside the classic full add/edit forms; this spec covers the quick-add entry points only.
