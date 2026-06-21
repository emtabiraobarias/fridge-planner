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
| EC-03 | Inventory | ☑ pass | — | — | **Fixed (BUG #2, `abf3088`)** — adding an existing-name ingredient prompts: **Merge** (sums quantities, units must match) / **Add separately** / Cancel |
| EC-04 | Inventory | ☑ pass | — | — | Expired = red highlight (US1-S8) + excluded from LLM (US1-S9) |
| EC-05 | Inventory | ◐ partial | — | — | Fresh vs expired distinguished by status/colour; only non-expired sent to LLM via `$ne` filter. Full "only non-expired counted" check belongs to the recs walk |
| EC-11 | Inventory | ☑ pass | — | — | No expiry → status `none`, white bg, included in list & recs |
| SC-001 | Inventory | ☐ not measured | — | — | Add-10-items-<3min is usability/timed; add flow works |
| SC-013 | Inventory | ☑ pass | — | — | Yellow/red colour-coding + summary counts ("1 expiring soon, 5 expired") = at-a-glance status |

**Legend:** ☑ pass · ✗ fail · ◐ partial · ☐ deferred (cross-feature, verify in that area's walk).

### Recommendations area — walked 2026-06-11 (live holodeck agent + code)

Live call: `POST /api/v1/recommendations` → **HTTP 200, 4 meals**, all from approved recipe domains.

| Scenario ID | Area | Result | Type | Fix location | Notes |
|-------------|------|--------|------|--------------|-------|
| US1-S2 | Recs | ☑ pass | — | — | 4 meals returned (3–5 ✓); all primarily use existing ingredients (chicken breast/carrots/rice/salt) |
| US1-S3 | Recs | ☑ pass | — | — | `usesIngredients` (owned) vs `missingIngredients` (e.g. onion, ginger) distinguishes owned from to-buy |
| US1-S4 | Recs | ◐ inconclusive | — | — | Only expiring item was a junk fixture (`S7-tomorrow`); agent reasonably ignored it. Retest with a *real* expiring ingredient. (Agent has an `ExpiryPrioritisation` eval.) |
| US1-S9 | Recs | ☑ pass | — | — | Excludes expired via **date-derived** `notExpiredQuery()` (BUG #6 fixed `41e9881`) — robust to stale stored status |
| EC-01 | Recs | ☑ pass | — | — | **Fixed (BUG #5, `3cc068d`)** — empty/all-expired → `POPULAR_RECIPES` + `fallback:'popular'` |
| EC-02 | Recs | ☐ not tested | — | — | Insufficient-ingredients → minimal-addition recipes — needs a sparse inventory fixture |
| EC-08 | Recs | ☑ pass | — | — | **Fixed (BUG #4/SC-010, `3cc068d`)** — agent failure → 200 with stale-cache-then-popular fallback + `fallback` flag (no more 500) |
| SC-002 | Recs | ✗ **FAIL** | bug (spec-tension) | both branches | Cold call **142 s** vs **5 s** target (~28×). Inherent to web-searching agent (`WebSearch`+`WebFetch`, `max_turns:15`). → BUG #3 + spec-gap SG-02 |
| SC-003 | Recs | ◐ not measured | — | — | Meals heavily use owned ingredients; ≥60%/80% not precisely computed |
| SC-014 | Recs | ☑ pass | — | — | **Fixed (BUG #6, `41e9881`)** — exclusion is date-derived, so a now-expired item can't leak to the LLM even if its stored status is stale |
| (bonus) RecipeUrlConformance | Recs | ☑ pass | — | — | All `recipeUrl`s from approved domains (recipetineats/kawalingpinoy/panlasangpinoy) |

### Calendar / meal-plan area — walked 2026-06-11 (running app + API + code)

| Scenario ID | Area | Result | Type | Fix location | Notes |
|-------------|------|--------|------|--------------|-------|
| US2-S1 | Calendar | ☑ pass | — | — | 7-day grid (Mon–Sun) with Breakfast/Lunch/Dinner **+ Snack** rows. (Spec/constitution name only B/L/D; Snack is an extra meal type — see minor note below) |
| US2-S2 | Calendar | ◐ not auto-verified | — | — | Drag rec card → slot. **Known intermittent drag-drop bug** (CLAUDE.md §12 / CalendarPage). HTML5 DnD not reliably automatable → **manual check needed** |
| US2-S3 | Calendar | ◐ not auto-verified | — | — | Drag a planned meal to another slot. Same DnD caveat. **BUG #7 fixed** (`7dca07a`) — a move no longer double-consumes (DELETE restores / PUT net-diffs) |
| US2-S4 | Calendar | ☑ pass | — | — | Multiple planned meals render organized by day column × meal-type row (e.g. Chicken Tinola @ Wed lunch, Arroz Caldo @ Fri dinner) |
| US2-S5 | Calendar | ☑ pass | — | — | "Remove meal" per filled cell; `DELETE …/entries/:slotId` removes it (API-verified) |
| US2-S6 | Calendar | ◐ partial | — | — | Empty vs filled visible per slot, but **no day-level "fully planned" indicator** (column headers are just dates) — overview is scan-only |
| US1-S6 | Calendar↔Inventory | ☑ pass | — | — | Adding a meal consumes ingredients (`testbeef` 5→4); now **reversible + awaited** (BUG #7 fixed `7dca07a`) — remove restores, move net-diffs. (Flat −1 remains; quantity precision tied to SG-03 servings.) |
| US1-S10 | Calendar | ◐ indirect | — | — | No direct "add expired item to plan" path — expired items are excluded from recs (US1-S9) and inventory rows aren't draggable; so prevention is indirect (and weakened by BUG #6 stale status) |
| (positive) | Calendar | ☑ | — | — | **meal-plan routes ARE scoped by `userId`** (GET/POST/DELETE/PUT) — BUG #1 does **not** extend here (confirmed: other user's GET → `null`) |

**Minor note:** the app supports a 4th meal type **Snack** (in `MEAL_TYPES`) not mentioned in spec US2-S1 / constitution §V ("B/L/D"). Additive, not a violation — flag as doc drift.

### Grocery-list area — walked 2026-06-11 (live + code)

Live: 3 meals (onion×3, garlic×1, soy-sauce×1) → `GET /grocery-lists/<week>` returned 3 items.

| Scenario ID | Area | Result | Type | Fix location | Notes |
|-------------|------|--------|------|--------------|-------|
| US3-S1 | Grocery | ◐ partial | — | — | Aggregates + groups: `Onion qty=3` with `sourceMealNames=[A,B,C]` ✓ — but quantity is a **meal count**, `unit='servings'`, not "3 onions" |
| US3-S2 | Grocery | ✗ fail | missing-feature (data-model gap) | both branches | **No unit normalization.** All items `unit='servings'`; "1 cup+2 cups+500 ml → common unit" impossible — `missingIngredients` is `string[]` with no qty/unit. → BUG #8 / SG-03 |
| US3-S3 | Grocery | ✗ fail | missing-feature | both branches | **No inventory deduction.** Generator comment: subtraction is a "future enhancement"; servings vs real units are `canSubtract=false`, so "Eggs: 4 needed (6−2)" never happens. → BUG #8 |
| US3-S4 | Grocery | ☑ pass | — | — | Items categorized (`Onion/Garlic→Produce`, `Soy Sauce→Pantry`) via keyword `inferCategory` + sorted by category (matches FR-003 "auto-categorization is grocery-only") |
| US3-S5 | Grocery | ◐ code-ok | — | — | `PATCH …/items/:id {isPurchased}` exists; UI check-off not driven this pass |
| US3-S6 | Grocery | ☑ code-ok | — | — | `POST …/complete` builds `new InventoryItem(...)` per purchased item → adds to inventory |
| US3-S7 | Grocery | ◐ code-ok | — | — | `GroceryListSearchBar` component exists (filter/search); UI not driven this pass |
| US1-S11 | Grocery | ◐ plausible | — | — | Expired-owned ingredient → LLM puts it in `missingIngredients` (US1-S9) → appears on list; inventory query is non-expired-only so it can't offset. Holds, but moot while deduction is off |
| SC-005 | Grocery | ✗ fail | — | both branches | "100% unit-conversion accuracy" unreachable — normalization not applied (servings). → BUG #8 |
| (positive) | Grocery | ☑ | — | — | Grocery routes **userId-scoped** — BUG #1 audit complete: inventory ✗, recs ✗, meal-plans ✓, grocery ✓ |

## Open bugs (this branch)

| # | Scenario ID(s) | Description | Severity | Status |
|---|----------------|-------------|----------|--------|
| 1 | US1-S1/S5 area (all "my inventory" scenarios) | **Cross-user data leak.** `GET /api/v1/inventory` builds its filter from only `category`/`status` — **never `userId`** — so it returns every user's items, and `summary` counts are global. `PUT`/`DELETE /:id` key on `_id` alone, so any user can edit/delete any item. Confirmed live: `userB` sees `userA`'s `USERA-SECRET-ITEM`. | **HIGH** (privacy / multi-tenant isolation; ties to CR-001 auth) | **✔ FIXED 2026-06-11 (`532e198`, cherry-picked from `impl/vite` `29d2e89`)** — `userId` scoping added to inventory GET filter + summary, PUT/DELETE (`findOneAndUpdate`/`findOneAndDelete` on `{_id, userId}`), and the recommendations query. Satisfies **FR-036**. TDD: `tests/integration/isolation.test.ts` (5 tests, red→green); 174/174 server tests pass. meal-plan/grocery were already scoped. |
| 2 | EC-03 | Duplicate ingredient silently creates a new row (POST→201); no merge/choose prompt in client or server. | LOW–MED | **✔ FIXED 2026-06-21** (`7ba9c59`→cherry-pick `abf3088`) — `InventoryForm` prompts Merge / Add separately / Cancel on a same-name add; uses non-throwing `useInventoryOptional()` (shared, no host changes). TDD `InventoryForm.duplicate.test.tsx`; client 113/117. |
| 3 | SC-002 | **Recommendation latency ~28× over budget** — cold call measured **142 s** vs the **5 s** SC-002 target. Root cause is the deliberate web-searching agent (`WebSearch`+`WebFetch`, `max_turns:15`). Cache (15 min TTL) only helps identical repeat calls; any inventory mutation invalidates it, so normal use is mostly cold. | **HIGH** | open — shared agent → **both branches**. **Resolution contested** (perf re-architecture vs revise SC-002 — see SG-02); needs spec-owner decision |
| 4 | EC-08 / SC-010 | **No graceful degradation.** Agent down/timeout → `getMealRecommendations` throws → route `next(err)` → HTTP 500. Spec wants a fallback to cached/popular recipes; cache is only read *before* the agent call, never as a failure fallback. | MED | **✔ FIXED 2026-06-19** (`edfb0a9`→cherry-pick `3cc068d`) — agent failure now returns 200 with `getStale()` last-known-good cache, else `POPULAR_RECIPES`, + `fallback` flag. `impl/vite` also got the missing 220s timeout (`2f01313`). TDD `recommendations-fallback.test.ts`; 182/182. |
| 5 | EC-01 | **No popular-recipe fallback on empty inventory.** Route returns `{recommendations:[]}` when no active items; spec wants "suggest popular recipes + prompt to add items". (UI prompt-to-add may exist; the popular-recipes half does not.) | MED | **✔ FIXED 2026-06-19** (same `edfb0a9`) — empty/all-expired inventory now returns `POPULAR_RECIPES` + `fallback:'popular'`. |
| 6 | US1-S7/S8/S9, SC-014, EC-04/EC-05 | **`expirationStatus` goes stale.** It's persisted and only recomputed in the Mongoose `pre('save')`/`pre('findOneAndUpdate')` hooks — never on read. So an item that crosses an expiry boundary keeps its old status until re-saved. Confirmed live: `S7-tomorrow` (expiry 2026-06-11) still stored `expiring-soon` on 2026-06-11 when it is actually `expired`. Impact: (a) UI shows stale yellow / no red, edit-delete stay enabled; (b) the recs `$ne:'expired'` filter **fails to exclude it → expired food fed to the LLM**, breaking SC-014 "100%". **Reconfirmed 2026-06-11** (data authored 06-10): stored=`expiring-soon` vs correct=`expired`; item is NOT in `?status=expired` (so recs include it); a PUT of `quantity` only leaves it stale, while a PUT writing `expiresAt` recomputes to `expired` — so it never self-corrects on a time boundary. **Fix direction:** derive status on read (or scheduled re-eval), don't persist a time-derived field. | **MED–HIGH** (food-safety) | **✔ FIXED 2026-06-19** — `expiration.ts` `expirationStatusQuery`/`notExpiredQuery` (date-range) + GET recompute via `getExpirationStatus`; all `$ne:'expired'` queries (recs/consumption/grocery) now date-based. TDD `expiration-staleness.test.ts`; `impl/vite` `95afbe5` → cherry-pick `impl/nextjs` `41e9881`; 179/179. |
| 7 | US1-S6, US2-S3/S5 | **Consumption is one-way / non-idempotent → inventory drift.** `POST …/entries` calls `consumeIngredients` (−1 per `usesIngredients`), but `DELETE …/entries/:slotId` only `$pull`s the entry — it **never restores** inventory. So removing a meal, **moving** it (delete+add re-consumes), or adding the same meal twice permanently over-decrements. Also: consumption is fire-and-forget (`void`, not awaited) and decrements a flat −1 ignoring recipe quantity/unit; and it filters `$ne:'expired'` so inherits BUG #6 staleness. | MED | **✔ FIXED 2026-06-20** (`c6bf4b8`→cherry-pick `7dca07a`) — consumption is now **reversible+awaited**: POST consumes, DELETE restores, PUT net-diffs (no double-consume on move). Decision: reversible-at-planning-time now; **"consume at checkout/cook" deferred to future roadmap** (FR-005 clarified). Known limit: item consumed to deletion isn't recreated. TDD `consumption-reversible.test.ts`; 185/185. |
| 8 | US3-S2, US3-S3, SC-005 | **Grocery aggregation is count-of-meals, not quantity-aware.** Generated items use `quantity = #meals` and `unit='servings'`; no unit normalization and no inventory deduction (generator explicitly defers subtraction as a "future enhancement"). **Root cause:** `MealRecommendation.missingIngredients` is `string[]` — the agent never returns ingredient quantities/units — so US3-S2 ("1 cup+2 cups+500 ml → common unit"), US3-S3 ("Eggs: 4 needed (6−2)"), and SC-005 ("100% conversion accuracy") cannot be met. Aggregation/grouping/categorization (US3-S1/S4) DO work. | MED | open — both branches; needs SG-03 decision (extend the meal model vs revise the scenarios) |

## Spec-gaps raised from this branch

Cross-reference; the authoritative register is in `ROADMAP_PROGRESS.md` on `main`.

| Scenario gap | Raised | Description | Status |
|--------------|--------|-------------|--------|
| per-user data isolation | 2026-06-08 | No FR/CR explicitly requires inventory (and meal-plans/grocery) to be scoped to the authenticated user — it's only *implied* by "my/their inventory" + CR-001 (auth). The bug above shows why this should be an explicit, testable requirement. Consider adding an FR. | proposed — discuss before editing `spec.md` on `main` |
| EC-03 merge prompt | 2026-06-08 | EC-03 *is* in the spec (edge case), so the gap is implementation, not spec — logged as BUG #2, not a spec-gap. Listed here only as a pointer. | n/a |
| SC-002 cold vs cached | 2026-06-11 | SC-002's flat "within 5 s" doesn't distinguish a **cached** hit (achievable) from a **cold, web-researched** recommendation (measured 142 s) — unrealistic for the chosen web-searching agent. Companion to BUG #3: the spec owner must decide whether to re-architect for 5 s or revise SC-002 (e.g. split cached `<5 s` vs fresh `<N s`). | proposed (SG-02) — decide before editing `spec.md`/SC-002 on `main` |
| grocery quantity model | 2026-06-11 | US3-S2/S3 + SC-005 assume meals carry **ingredient quantities/units** (e.g. "milk 1 cup", "6 eggs"), but `MealRecommendation` only returns ingredient **names**. So quantity-aware aggregation/deduction is impossible by design (BUG #8). Decide: (a) extend the meal model — agent returns `{name, quantity, unit}` per ingredient — to meet US3-S2/S3/SC-005, or (b) revise those scenarios to the servings/count model. | proposed (SG-03) — decide before editing `spec.md` on `main` |
