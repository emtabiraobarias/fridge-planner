# Verification Findings — `impl/nextjs`

> **Per-branch log** (Next.js 15 App Router; client `:3000`, Express API `:3001`).
> Branch-specific — kept with `--ours` on `git merge main`; never lives on `main`.
>
> Walk the shared checklist [`checklists/acceptance-scenarios.md`](checklists/acceptance-scenarios.md)
> against the running app and record results here by **scenario ID**.
>
> **Routing (see ROADMAP "Phase B/C/D — both-implementation tracking"):**
> - **spec-gap** (no scenario/FR) → fix `spec.md` on `main`; add to the shared checklist; log in main's spec-gap register.
> - **frontend bug** → fix here on `impl/nextjs`.
> - **backend bug** (`packages/server`) → fix here **and** cherry-pick to `impl/vite` (Express is duplicated until C-bis).
>
> Status legend: ☐ to-do · ◐ in progress · ☑ pass · ✗ fail (open) · ✔ fixed.

## How to run (this branch)

```bash
docker compose up mongodb -d        # + holodeck for recommendations
npm run dev                         # Express :3001 + Next.js :3000
# open http://localhost:3000
```

## Phase B — verification results

### Inventory area — walked 2026-06-08 (verified against running app + code)

| Scenario ID | Area | Result | Type | Fix location | Notes |
|-------------|------|--------|------|--------------|-------|
| US1-S1 | Inventory | ☑ pass | — | — | POST saves name/qty/unit/category; renders in list (API + UI) |
| US1-S6 | Inventory↔MealPlan | ☐ deferred | — | — | Consumption updates inventory — verify in calendar walk |
| US1-S7 | Inventory | ☑ pass | — | — | Expiring-soon (tomorrow) row bg = `yellow-50` (rgb 254,252,232) |
| US1-S8 | Inventory | ☑ pass | — | — | Expired row bg = `red-50` (rgb 254,242,242) **and** Edit/Delete buttons `disabled` |
| US1-S9 | Inventory↔Recs | ☑ pass | — | — | `recommendations.ts` queries `expirationStatus: { $ne: 'expired' }` before building LLM prompt (code-verified) |
| US1-S10 | Inventory↔MealPlan | ☐ deferred | — | — | Prevent adding expired to a meal plan + message — calendar walk |
| US1-S11 | Inventory↔Grocery | ☐ deferred | — | — | Expired-owned ingredient → grocery as new-to-buy — grocery walk |
| EC-03 | Inventory | ✗ fail | missing-feature (spec edge case) | both branches | No duplicate merge/choose prompt; duplicate POST returns 201 and UI shows 3 separate "carrots" rows. No `duplicate`/`merge` handling in client or server. → BUG #2 |
| EC-04 | Inventory | ☑ pass | — | — | Expired = red highlight (US1-S8) + excluded from LLM (US1-S9) |
| EC-05 | Inventory | ◐ partial | — | — | Fresh vs expired distinguished by status/colour; only non-expired sent to LLM via `$ne` filter. Full "only non-expired counted" check belongs to the recs walk |
| EC-11 | Inventory | ☑ pass | — | — | No expiry → status `none`, white bg, included in list & recs |
| SC-001 | Inventory | ☐ not measured | — | — | Add-10-items-<3min is usability/timed; add flow works |
| SC-013 | Inventory | ☑ pass | — | — | Yellow/red colour-coding + summary counts ("1 expiring soon, 5 expired") = at-a-glance status |

**Legend:** ☑ pass · ✗ fail · ◐ partial · ☐ deferred (cross-feature, verify in that area's walk).

## Open bugs (this branch)

| # | Scenario ID(s) | Description | Severity | Status |
|---|----------------|-------------|----------|--------|
| 1 | US1-S1/S5 area (all "my inventory" scenarios) | **Cross-user data leak.** `GET /api/v1/inventory` builds its filter from only `category`/`status` — **never `userId`** — so it returns every user's items, and `summary` counts are global. `PUT`/`DELETE /:id` key on `_id` alone, so any user can edit/delete any item. Confirmed live: `userB` sees `userA`'s `USERA-SECRET-ITEM`. | **HIGH** (privacy / multi-tenant isolation; ties to CR-001 auth) | open — **backend bug → fix on both branches** (cherry-pick); likely also in recommendations/meal-plan/grocery queries — audit all |
| 2 | EC-03 | Duplicate ingredient silently creates a new row (POST→201); no merge/choose prompt in client or server. | LOW–MED | open — both branches (client + server) |

## Spec-gaps raised from this branch

Cross-reference; the authoritative register is in `ROADMAP_PROGRESS.md` on `main`.

| Scenario gap | Raised | Description | Status |
|--------------|--------|-------------|--------|
| per-user data isolation | 2026-06-08 | No FR/CR explicitly requires inventory (and meal-plans/grocery) to be scoped to the authenticated user — it's only *implied* by "my/their inventory" + CR-001 (auth). The bug above shows why this should be an explicit, testable requirement. Consider adding an FR. | proposed — discuss before editing `spec.md` on `main` |
| EC-03 merge prompt | 2026-06-08 | EC-03 *is* in the spec (edge case), so the gap is implementation, not spec — logged as BUG #2, not a spec-gap. Listed here only as a pointer. | n/a |
