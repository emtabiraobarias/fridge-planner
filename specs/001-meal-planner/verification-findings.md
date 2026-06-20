# Verification Findings — `impl/vite`

> **Per-branch log** (React + Vite 5 SPA; client `:5173`, Express API `:3001`).
> Branch-specific — kept with `--ours` on `git merge main`; never lives on `main`.
>
> Walk the shared checklist [`checklists/acceptance-scenarios.md`](checklists/acceptance-scenarios.md)
> against the running app and record results here by **scenario ID**.
>
> **Routing (see ROADMAP "Phase B/C/D — both-implementation tracking"):**
> - **spec-gap** (no scenario/FR) → fix `spec.md` on `main`; add to the shared checklist; log in main's spec-gap register.
> - **frontend bug** → fix here on `impl/vite`.
> - **backend bug** (`packages/server`) → fix here **and** cherry-pick to `impl/nextjs` (Express is duplicated on both).
>
> Status legend: ☐ to-do · ◐ in progress · ☑ pass · ✗ fail (open) · ✔ fixed.

## How to run (this branch)

```bash
docker compose up mongodb -d        # + holodeck for recommendations
npm run dev                         # Express :3001 + Vite :5173
# open http://localhost:5173
```

## Phase B — verification results

### Confirmation vs `impl/nextjs` — 2026-06-11

**Method:** rather than re-run every scenario, confirmed by **code comparison** (`git diff impl/vite impl/nextjs`).
The backend (`packages/server`) is duplicated; the buggy files are **byte-identical**, so backend findings
reproduce by identity. Frontend findings confirmed by **equivalent component logic** in the Vite SPA.

**Backend files driving #1/#4/#5/#6/#7 — `git diff` = IDENTICAL:** `inventory.ts`, `recommendations.ts`,
`inventory-item.ts`, `expiration.ts`, `ingredient-consumption.ts`, `meal-plans.ts`, `grocery-list-generator.ts`.

**Only server deltas vs `impl/nextjs`:** `meal-recommender.ts` (impl/vite **lacks** the 220s `AbortSignal.timeout` → **#4 is worse here**), `ingredient-matcher.ts` (pure refactor, same logic), `grocery-lists.ts` route (minor; servings generator identical).

| Scenario ID | Area | Result | Notes (impl/vite) |
|-------------|------|--------|-------------------|
| US1-S7/S8 | Inventory | ☑ pass (same) | `InventoryList.tsx`: `bg-yellow-50` / `bg-red-50` + `disabled={status==='expired'}` — identical behaviour (and same #6 staleness) |
| US1-S1/S9, EC-04/EC-11, SC-013 | Inventory | ☑ pass (same) | server identical; Vite UI equivalent |
| US1-S2/S3 | Recs | ☑ pass (same) | `MealCard.tsx` renders uses/missing; shared agent |
| US2-S1/S4/S5, US1-S6 | Calendar | ☑ pass (same) | meal-plan server identical (userId-scoped); `WeeklyCalendar.tsx` grid |
| US2-S2/S3 | Calendar | ◐ **manual** | Drag-drop — **the flakiness originated on this Vite impl** (CLAUDE.md). Priority manual check here |
| US3-S1/S4/S6 | Grocery | ☑ pass (same) | generator identical (servings); grocery components present |

## Open bugs (this branch)

All `impl/nextjs` bugs **confirmed present on `impl/vite`** (numbering matches `impl/nextjs`):

| # | Confirmed how | Severity | Status |
|---|---------------|----------|--------|
| 1 | `inventory.ts` + `recommendations.ts` byte-identical → cross-user data leak reproduces | HIGH | **✔ FIXED 2026-06-11 (`29d2e89`, this branch led; cherry-picked to `impl/nextjs` `532e198`)** — `userId` scoping on inventory GET/PUT/DELETE + recs query; **FR-036**; `tests/integration/isolation.test.ts` (5, red→green); 174/174 pass |
| 2 | No duplicate/merge handling in Vite client either → EC-03 reproduces | LOW–MED | open |
| 3 | Shared agent (142s); now reframed async (SC-002). Vite client also needs the async UX | HIGH→spec | open — per-branch UX |
| 4 | `recommendations.ts` identical (no fallback) **and** `meal-recommender.ts` here **lacked** the 220s timeout → was **worse** (hung indefinitely) | MED (worse) | **✔ FIXED (led here) 2026-06-19** — graceful fallback `edfb0a9` (stale-cache→popular, no 500) **+ added the missing 220s timeout** `2f01313`. Cherry-picked to `impl/nextjs` `3cc068d`. 182/182. |
| 5 | `recommendations.ts` identical → empty inventory returns `[]`, no popular-recipe fallback | MED | **✔ FIXED (led here) 2026-06-19** — empty/all-expired → `POPULAR_RECIPES` + `fallback:'popular'` (`edfb0a9`). |
| 6 | `inventory-item.ts` + `expiration.ts` identical → stale `expirationStatus`; Vite UI reads it → stale yellow/red + recs leak | MED–HIGH | **✔ FIXED (led here) 2026-06-19** — `95afbe5`: date-derived on read (`expiration.ts` query builders + GET recompute; recs/consumption/grocery now date-based). Vite SPA reads the corrected status from the API → highlighting self-corrects. TDD `expiration-staleness.test.ts`; 179/179. Cherry-picked to `impl/nextjs` `41e9881`. |
| 7 | `meal-plans.ts` + `ingredient-consumption.ts` identical → one-way consumption | MED | open — backend |
| ~~8~~ | `grocery-list-generator.ts` identical (servings) — **now matches spec** (SG-03) → not a bug | — | n/a (Phase 2+) |

## Spec-gaps raised from this branch

Cross-reference; the authoritative register is in `ROADMAP_PROGRESS.md` on `main`.

| Scenario gap | Raised | Description | Status |
|--------------|--------|-------------|--------|
| _(none yet)_ | | | |
