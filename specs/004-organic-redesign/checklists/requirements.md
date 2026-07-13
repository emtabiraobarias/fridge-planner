# Requirements Quality Checklist — Organic UI Redesign (spec 004)

Gate the spec before implementation. Each item is PASS/FAIL against `spec.md` + `design/*`.

## Completeness
- [x] Every screen in scope (Kitchen, Meal plan, Groceries, Feedback) has a user story and FRs. — US1–US7, FR-UI-012..033.
- [x] The two headline UX changes (bottom tab bar, smart quick-add) are each a P1 story. — US2, US3.
- [x] All design values needed to build are captured self-contained (no external handoff dependency). — `design/organic-design-system.md` + `design/reference-logic.md`.
- [x] The client-side algorithms (parser, expiry, stepper, placement, checkout) are specified with worked examples. — `design/reference-logic.md`.

## Clarity / testability
- [x] Each user story has independent-test guidance and Given/When/Then scenarios.
- [x] Each FR is singular and verifiable.
- [x] Success criteria are measurable and technology-agnostic. — SC-UI-001..008.
- [x] Removed/replaced flows are named explicitly, not implied. — FR-UI-019/026/029/031.

## Consistency
- [x] FR numbering avoids collision with specs 001/002/003. — `FR-UI-` prefix.
- [x] Labels in the spec match the design reference (Kitchen/Meal plan/Groceries/Feedback). — FR-UI-009 ↔ design §2.
- [x] No requirement contradicts another (e.g. tap-to-place primary vs DnD demoted, not removed). — FR-UI-026/031.

## Scope / boundaries
- [x] Frontend-only boundary stated; no new endpoints/models/contract. — Scope boundary note, FR-UI-030, SC-UI-008.
- [x] Two-impl positioning stated (spec-level, nextjs-first, vite deferred). — header note.
- [x] Out-of-scope items listed. — plan.md "Out of scope".

## Constitutional
- [x] Relevant CRs identified and satisfiable (testing, coverage, a11y, responsive, config). — CR-005/006/007/009/010/011/016/017.
- [x] Contract-stability requirement present (CR-007, SC-UI-008).
- [x] Accessibility requirements concrete (focus outline, `aria-current`, contrast, keyboard). — FR-UI-004/010, CR-011, SC-UI-007.

## Verification plan
- [x] E2E with screenshot proof is a named deliverable. — SC-UI-006, T026.
- [x] Existing tests to update are enumerated. — FR-UI-034, tasks G1–G4.

**Gate result: PASS** — ready to implement on `impl/nextjs`.
