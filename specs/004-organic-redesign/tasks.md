# Tasks: Organic UI Redesign (`impl/nextjs`)

**Spec**: [`spec.md`](spec.md) · **Plan**: [`plan.md`](plan.md) · **Design**: [`design/organic-design-system.md`](design/organic-design-system.md), [`design/reference-logic.md`](design/reference-logic.md)

TDD where practical. `[P]` = parallelizable with siblings. FR-UI traceability in parentheses.

## G1 — Tokens, fonts, shell

- [ ] **T001** Extend `tailwind.config.ts` `theme.extend` with the Organic colour ramps, fonts, radii, and shadows (FR-UI-001/002/003).
- [ ] **T002** Global stylesheet `src/index.css`: expose tokens as CSS vars; add base rules — cream body, heading/body faces, `:focus-visible` terracotta outline, `::selection` tint, link colours, disabled opacity (FR-UI-004).
- [ ] **T003** `layout.tsx`: load Caprasimo (400) + Figtree (400/600/700) via `next/font/google`; apply cream page frame (min-h-screen, bottom padding for nav, max-w-1160 container) + brand header (terracotta circle + fridge icon + wordmark) (FR-UI-002/005/006).
- [ ] **T004** Add `lucide-react` dependency (stroke-width 2.75 convention) (FR-UI-003; CR-017).
- [ ] **T005** [test-first] Update `tests/app/nav.test.tsx` for the four renamed tabs, routes, active `aria-current`, and urgent badge (FR-UI-009/010/011; FR-UI-034).
- [ ] **T006** Rewrite `app/nav.tsx` as the floating bottom tab bar: four tabs (Kitchen/Meal plan/Groceries/Feedback) with icons, active terracotta fill + `aria-current`, inactive neutral-300 + white hover tint, Kitchen urgent badge (FR-UI-007/008/009/010/011).

## G2 — Kitchen

- [ ] **T007** [test-first][P] `tests/lib/quick-parse.test.ts` covering the worked examples + edge cases in `reference-logic.md` (parseQuick, expiryText, daysLeft, stepFor) with an injected fixed `TODAY` (FR-UI-015; SC-UI-003).
- [ ] **T008** Implement `src/lib/quick-parse.ts` (pure): `parseQuick`, `daysLeft`, `expiryText`, `stepFor`, urgency helpers (FR-UI-015).
- [ ] **T009** `src/context/ToastContext.tsx` + `src/components/shared/Toast.tsx` — single global toast, ~2.6s auto-dismiss, above the nav (FR-UI-032).
- [ ] **T010** `QuickAdd.tsx` (replaces `InventoryForm.tsx`): pill input + sparkles icon, live parse preview tags, staple chips, Enter/Add submit → create item + toast; empty/name-less = no-op (FR-UI-014/016).
- [ ] **T011** [P] `UseSoonStrip.tsx` (visible when any item urgent; urgent pills + "Cook these →" scroll) (FR-UI-013).
- [ ] **T012** [P] `LocationFilter.tsx` segmented control + "N of M items" count (FR-UI-020).
- [ ] **T013** [P] `QuantityStepper.tsx` — unit-aware ± steps, zero-removal (FR-UI-019).
- [ ] **T014** Rewrite `InventoryList.tsx` rows: status dot, name, category·location, expiry line, stepper, delete; expired bg; soonest-first sort; **drop edit-in-place** (FR-UI-017/018/019/031).
- [ ] **T015** Recompose `InventoryPage.tsx` two-column layout (use-soon → quick-add → filter → list | recommendations); wire `InventoryContext` parse-commit + step + zero-remove (FR-UI-012).
- [ ] **T016** Update inventory component tests for the new components/labels/flows (FR-UI-034).

## G3 — Recommendations + placement + calendar

- [ ] **T017** Restyle `RecommendationsPanel.tsx` + `MealCard.tsx` (kicker/title/meta/description, ingredient tag variants, "Plan it" pill) (FR-UI-021).
- [ ] **T018** Add `placing: {mealName,time}|null` shared state (MealPlan/Recommendations context) + "Plan it" → navigate to `/calendar` in placement mode (FR-UI-022).
- [ ] **T019** [test-first] Calendar tests: placement banner appears, empty slots become the click targets, tap places + toast + exits, Cancel exits (FR-UI-024; FR-UI-034).
- [ ] **T020** Rebuild `CalendarPage.tsx` + `src/components/calendar/*`: week grid (today outlined), filled/empty slots, placement banner, suggestions rail; tap-to-place primary; demote `DraggableMealCard.tsx` to optional (FR-UI-023/024/025/026).

## G4 — Groceries + Feedback + toast

- [ ] **T021** [test-first] Grocery tests: category groups, progress bar, optimistic check toggle, checkout button count + move-to-inventory (FR-UI-027/028/029; FR-UI-034).
- [ ] **T022** Restyle `GroceryListPage.tsx` + `src/components/grocery/*`: header + Regenerate, progress row, category groups, round checks, NL quick-add; **replace `CheckoutConfirmModal`** with the inline "Done shopping — move N items into my kitchen" button (FR-UI-027/028/029/031).
- [ ] **T023** Restyle `FeedbackPage.tsx` + `src/components/feedback/*`: empty state, role-labelled aligned bubbles, pending bubble, pill input Enter-to-send — contract unchanged (FR-UI-033).
- [ ] **T024** Mount the global toast in the app frame; wire inventory add/remove, placement, checkout to it (FR-UI-032).

## G5 — Verify

- [ ] **T025** `npm run lint` (zero warnings) + `npm test` (coverage ≥70%) + `npm -w packages/client run build` all green (SC-UI-006; CR-006).
- [ ] **T026** Add `@playwright/test` + config + `e2e/` spec that drives all four redesigned screens (quick-add, tap-to-place, checkout, feedback chat) and captures a screenshot per screen; add an npm script (SC-UI-006; FR-UI-034).
- [ ] **T027** Assert focus-outline + `aria-current` states in tests/E2E (SC-UI-007); confirm `validate-e2e.sh --no-agent` still 9/9.
- [ ] **T028** SC-UI-008 diff check: no changes under `app/api/**` or `src/server/**`; then **delete `design_handoff_organic_redesign/`** (spec now self-contained) and update ROADMAP + memory.
