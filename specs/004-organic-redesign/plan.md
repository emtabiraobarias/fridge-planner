# Implementation Plan: Organic UI Redesign (`impl/nextjs`)

**Branch**: `impl/nextjs` · **Spec**: [`spec.md`](spec.md) · **Design reference**: [`design/organic-design-system.md`](design/organic-design-system.md) + [`design/reference-logic.md`](design/reference-logic.md)

> **Per-branch plan** (not on `main`). This is the `impl/nextjs` enforcement of the shared, topology-agnostic spec `004`. The `impl/vite` implementation is deferred by decision (Phase G status matrix) and will get its own `plan.md` when built. Spec + `design/*` + `checklists/*` are shared and promotable to `main`.

## Technical Context

- **Stack:** React 18 + Next.js 15 App Router + Tailwind CSS 3.4 (client package `packages/client`), one Next process on `:3000`. State via React Context + hooks (no Redux/Zustand — constitution). Icons: **add `lucide-react`**. Fonts: **`next/font/google`** (Caprasimo 400; Figtree 400/600/700). E2E: **add `@playwright/test`**.
- **This is frontend-only.** No `app/api/**`, `src/server/**`, model, or contract changes (FR-UI-030 / SC-UI-008). Verified by keeping the diff out of those trees.
- **Existing surfaces reused unchanged:** `src/services/*` fetch wrappers, `src/context/*` providers, the four `app/**/page.tsx` routes → `src/views/*`, and the existing API endpoints (inventory CRUD, meal-plan entries, grocery items/complete, recommendations, feedback chat).

## Constitution Check

- **No state library added** (Context/hooks only) ✓. **No API/contract change** ✓ (CR-007/CR-012/CR-014). **TDD** for parser + interaction changes (CR-005). **Coverage ≥70%** maintained (CR-006). **WCAG 2.1 AA**: non-default focus outline, `aria-current`, token contrast, keyboard operability (CR-011). **320–1920px** responsive (CR-010). **Bundled fonts** to protect TTI/CLS (CR-009). New deps declared in the lockfile (CR-017).
- **Branch discipline:** presentation-only, per-branch code on `impl/nextjs`; shared spec artifacts promotable to `main`. No merge to `main` of impl code (two-impl model).

## Design → code mapping

| Design reference | Files (impl/nextjs) |
|---|---|
| Tokens + fonts + globals | `packages/client/tailwind.config.ts`, `packages/client/src/index.css`, `packages/client/app/layout.tsx` |
| Shell: header + bottom tab bar | `packages/client/app/nav.tsx` (+ layout page frame) |
| Parser / expiry / stepper logic | **new** `packages/client/src/lib/quick-parse.ts` (client, pure) |
| Toast | **new** `packages/client/src/context/ToastContext.tsx` + `src/components/shared/Toast.tsx` |
| Kitchen screen | `src/views/InventoryPage.tsx`; **replace** `src/components/inventory/InventoryForm.tsx` → `QuickAdd.tsx`; rewrite `InventoryList.tsx` rows; **new** `UseSoonStrip.tsx`, `LocationFilter.tsx`, `QuantityStepper.tsx` |
| Recommendations + placement | `src/components/recommendations/RecommendationsPanel.tsx` + `MealCard.tsx`; placement via `MealPlanContext`/`RecommendationsContext` |
| Meal plan (tap-to-place) | `src/views/CalendarPage.tsx` + `src/components/calendar/*` (`WeeklyCalendar`, `CalendarSlot`, `MealSlotCard`); demote `DraggableMealCard.tsx` |
| Groceries + inline checkout | `src/views/GroceryListPage.tsx` + `src/components/grocery/*`; **remove** `CheckoutConfirmModal.tsx` usage |
| Feedback restyle | `src/views/FeedbackPage.tsx` + `src/components/feedback/*` |

## Phase breakdown (each phase ends runnable + tests green)

1. **G1 — Tokens, fonts, shell.** Extend `tailwind.config.ts` with the token set; expose CSS vars + global state rules in `index.css`; load fonts in `layout.tsx`; add `lucide-react`; rewrite `nav.tsx` as the bottom tab bar (renamed labels, active/`aria-current`, urgent badge) and add the brand header + cream page frame. Update `tests/app/nav.test.tsx`.
2. **G2 — Kitchen.** `quick-parse.ts` (TDD first) + `ToastContext`; `QuickAdd` (live preview + staples), `UseSoonStrip`, `LocationFilter`, `QuantityStepper`, rewritten list rows; wire into `InventoryPage` + `InventoryContext` (parse-commit, step, zero-remove). Update inventory tests; add parser unit tests.
3. **G3 — Recommendations + placement + calendar.** Restyle panel/`MealCard`; add `placing` shared state; tap-to-place week grid + placement banner + suggestions rail in `CalendarPage`; keep DnD optional. Update calendar tests.
4. **G4 — Groceries + Feedback + toast.** Restyle grocery screen (progress, groups, round checks, quick-add, inline "Done shopping" replacing the modal); restyle feedback chat; mount the global toast above the nav. Update grocery tests.
5. **G5 — Verify.** `npm run lint`, `npm test` (coverage ≥70%), `next build`; **Playwright** E2E driving all four screens with screenshot proof; `validate-e2e.sh --no-agent` still green. Then delete the external design handoff folder (spec is now self-contained).

## Risks & mitigations

- **Coverage dip** from large view rewrites → co-locate tests with each component; parser is pure and fully unit-tested.
- **Font CLS / render-block** → `next/font` self-hosting + `display: swap`.
- **Accidental API/contract drift** → keep the diff strictly out of `app/api/**` + `src/server/**`; SC-UI-008 diff check in G5.
- **DnD regression** → tap-to-place is the tested primary path; DnD retained only if it doesn't complicate the slot click target.
- **Playwright vs the existing Vitest gate** → Playwright is additive (new `e2e/` dir + script), does not replace the Vitest suite or `validate-e2e.sh`.

## Out of scope

Backend/API/agent changes; the `impl/vite` implementation (deferred); new persisted entities; async recommendation UX (tracked separately). Drag-and-drop is not removed, only demoted.
