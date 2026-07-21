# Quickstart — Daily Rolling Grocery-List Refresh (`impl/nextjs`)

Dev/test walkthrough for spec 008. Prereqs: MongoDB and Holodeck available for normal app flows (`docker compose up -d mongodb holodeck`), plus `packages/client/.env.local` with `MONGODB_URI`, `HOLODECK_URL`, and `AUTH_MODE=dev` for local manual testing.

> Spec 008 is a superset of 006/007: cook shrinks needs (006), buy grows inventory (007), **day rollover sheds stale meals + rows (008)**. "Today" is derived from the server clock — to exercise rollovers manually, change the host date/clock (or use fake timers in tests) rather than any UI control.

## Run it

```bash
npm run dev
```

1. **Date-scoped generation (RG1)**: Calendar → plan a planned (uncooked) dinner for **yesterday** and one for **tomorrow**, each needing the same ingredient → Grocery → Regenerate. Only the tomorrow dinner's ingredients appear; the yesterday dinner contributes nothing (FR-RG-001). A line sourced from both shows only the tomorrow meal's shortfall and lists only the tomorrow meal in its sources (FR-RG-007).
2. **Removal of fully-past needs (RG1)**: with a generated, unpurchased line whose only source meal was yesterday, Regenerate → the line is gone (FR-RG-006).
3. **Same-day integrity (RG2)**: tick a generated line purchased (Kitchen increments per spec 007; the row now carries `purchasedOn`=today) and add a manual item (`addedOn`=today). Refresh the grocery page repeatedly the same day → both rows persist unchanged, receipt intact (FR-RG-004/005). Un-tick the purchased row → it reverses exactly per its receipt (FR-RG-011), unaffected by the refreshes.
4. **Daily shed (RG2)**: advance the host clock past midnight (or set the meal/purchase to "yesterday"), refresh → the purchased row and the manual item are gone from the list; Kitchen still holds the purchased stock and the list does **not** re-ask for it (owned stock nets it off — FR-RG-005/011). Un-ticking the shed row is no longer offered (404).
5. **Auto-freshness on view (RG3)**: with a list last computed "yesterday," open the Grocery page today with no explicit action → the shown needs already reflect today's scope (FR-RG-002, SC-RG-002). Cook a today-onwards meal, reopen → its need is reduced with no manual regenerate (SC-RG-004). Manual Regenerate produces an identical list (FR-RG-002 scenario 2).
6. **Future-week view (RG3)**: navigate to next week's list → all of that week's planned meals count, since every date is today-or-later (FR-RG-002 scenario 3).

## Test it

```bash
npm -w packages/client run test -- tests/server/unit/rolling-grocery.test.ts
npm -w packages/client run test -- tests/server/grocery-lists.test.ts
npm test
npm -w packages/client run build
npm -w packages/client run test:e2e
bash scripts/validate-e2e.sh --no-agent
```

- Use `vi.useFakeTimers()` + `vi.setSystemTime()` to cross the midnight boundary deterministically; add a focused boundary case at local 23:59 vs 00:01 to lock down the local-vs-UTC cutoff (Research D3).
- Server tests seed meal-plan entries with explicit `date` values relative to a fixed "now," assert generated needs before/after the cutoff, and fire a recompute between a tick and an un-tick to prove receipt preservation (FR-RG-011).

## Verification log

### T001 — Baseline (before RG1), 2026-07-22
- `npm run lint` → clean (0 warnings/errors).
- `npm test` → **55 test files passed, 546 tests passed**, 0 failures (~duration 12s wall). Coverage gate met. (Some passing tests print expected error stack traces — no failures.)

### T002 — Existing grocery-list assertions that assume 007 "generate once, then verbatim"
Reviewed `packages/client/tests/server/grocery-lists.test.ts`. The following assume 007 semantics and are consciously reshaped by US1/US3 **later** (NOT modified in Phases 1–3):
- `GET › 'lazily generates a list from the meal plan on first GET'` (L146–153): asserts `items.length > 0` from a **past-dated** seed (`validMealEntry.date = 2026-04-06`). This relies on GET's lazy-create NOT being date-scoped. Preserved in Phases 1–3 because getGroceryList keeps the 007 path (generator called without `asOf`). US3 (T022/T025, not mine) recomputes GET on-view and will re-anchor this to explicit dates.
- `GET › 'aggregates the same ingredient across multiple meals'` (L155–161): same past-dated seed; relies on GET returning generated content without date scope. US3 will re-scope.
- `GET › 'isolates lists by user'` / `'returns { groceryList: null }'`: null/isolation paths — unaffected by rolling (US3 keeps the null short-circuit, T023/T026).
- `POST generate › 'regenerates and preserves manually-added items'` (L181–189): seeds past-dated `validMealEntry` + a manual "Bread". Under US1 (T013) the past meal contributes nothing, but the manual row is sticky pass-through, so the sole assertion (`bread.isManuallyAdded === true`) still holds. Not modified.

Reconfirmed there is **no** existing assertion that GET returns a stored document byte-verbatim on a second read, so US3's recompute-on-view has no direct 007 test to overturn — only the past-dated lazy-generate expectations above.

### RG-phase per-task log (Phases 1–3, T001–T013)

- **T003/T004/T005** — Added `addedOn?`/`purchasedOn?` to server `IGroceryListItem`, client `GroceryListItem` (ISO string), and the Mongoose `groceryListItemSchema` (`type: Date, required: false`, no default). Optional-only, no migration.
- **T006 (TDD)** — Wrote `startOfTodayCutoff` unit tests first; observed failure: `Failed to load url @server/lib/rolling-grocery … Does the file exist?` (module absent). After T007 the 3 tests pass, including the 23:59-vs-00:01 boundary under `TZ=Australia/Sydney` (research D3). **Runner note:** vitest must be run with cwd `packages/client` (`vitest run --coverage` is configured there); running from repo root leaves the `@server` alias unresolved.
- **T007** — Created `src/server/lib/rolling-grocery.ts` with real `startOfTodayCutoff()` + a throwing `reconcileRollingList` stub. T006 → green.
- **T008 (TDD)** — Reconcile unit tests written against the stub; observed failure: 5 tests throw `reconcileRollingList not implemented (Phase 3 / US1)` (3 startOfTodayCutoff still green).
- **T009 (TDD)** — Extended `grocery-list-generator.test.ts` with date-scope cases; observed failure: `expected 2 to be 1` (soy sauce counted both meals) and `expected 3 to be 2` (servings fallback counted the past meal). The cooked-yesterday, since-shed-netting, and asOf-omitted cases passed pre-impl (already covered by status/netting).
- **T010 (TDD)** — Added `POST /generate` rolling-scope handler tests; observed failure: `expected 2 to be 1` (all-week count) and `_id` mismatch (old regenerate wiped+recreated generated rows). The FR-RG-006 drop case passed pre-impl (non-manual rows were already dropped by 007 concat).
- **T011** — `generateGroceryList` gained optional `asOf?: Date`; filters `planned` entries to `entry.date >= asOf` when supplied. **Deviation (intentional):** `asOf` is optional, not required — this keeps `getGroceryList`'s lazy-create path on the exact 007 semantics (called without `asOf`) as the US1 checkpoint requires ("GET still uses the old 007 path until Phase 5"), and preserves the existing past-dated GET tests. `regenerateGroceryList` always passes the cutoff.
- **T012** — Implemented `reconcileRollingList(existing, freshGenerated, _asOf)`: partitions by `isReplaceableGenerated` (`!manual && !purchased && !receipt`), diffs replaceable rows by `ingredientName` (keep `_id`, overwrite `quantity`/`unit`/`sourceMealNames`; drop on zero/absent; insert new), sticky rows pass through verbatim. `_asOf` reserved for the US2 shed (lint-clean via `_` prefix).
- **T013** — `regenerateGroceryList` now computes `asOf = startOfTodayCutoff()`, generates date-scoped, and merges via `reconcileRollingList(existing.toObject().items, generatedItems, asOf)` (`.toObject()` avoids the 006 hydrated-subdoc spread bug). `getGroceryList` untouched.
- **Phase 1–3 result** — Focused `rolling-grocery.test.ts` + `grocery-list-generator.test.ts` + `grocery-lists.test.ts` = **57 passed**. `npm run lint` clean. Full `npm test` (with coverage) = **56 files / 562 tests passed** (baseline 546 → +16). `npm -w packages/client run build` clean.

## Release handoff

- [ ] Create release/version tag after review
- [ ] Build and push deployment images
- [ ] Redeploy through Portainer and verify production health checks
- [ ] Run post-deploy smoke validation against the deployed URL
- [ ] Confirm spec 001 FR-025/026/030/031 cascade merged on `main` (FR-RG-012)

## Gotchas

- **GET now mutates**: recompute-on-view persists the reconciled document. Generated rows keep their `_id` via name-reconcile, so an in-flight tick from a prior render still targets a live row; a lost race already refetches on 404/409 (existing `GroceryListContext`).
- **Local vs UTC midnight**: meal entries are stored at UTC midnight (`getWeekDays`), the host runs local — the cutoff maps the local calendar day onto the UTC-midnight axis. Get this wrong and meals flip in/out of scope near midnight.
- **Shed is final for reversal**: after a purchased row sheds, its receipt is gone and un-tick 404s; the inventory addition stays. Correct a post-shed purchase via normal Kitchen editing, not un-tick.
- **Rolling recompute touches no inventory** — so it never invalidates the recommendation cache (only 007 tick/checkout do).
- **Legacy rows**: pre-008 manual/purchased rows without an anchor are lazily stamped to the recompute day, so they survive one day rather than vanishing on deploy.
- Do not add a scheduler/cron — recompute-on-view is the clarified mechanism (FR-RG-002).
