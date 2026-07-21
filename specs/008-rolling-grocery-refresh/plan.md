# Implementation Plan: Daily Rolling Grocery-List Refresh (`impl/nextjs`)

**Branch**: `008-implement` · **Date**: 2026-07-22 · **Spec**: [`spec.md`](spec.md)
**Input**: Feature specification from `specs/008-rolling-grocery-refresh/spec.md`

> **Per-branch plan** (not on `main`). This is the `impl/nextjs` implementation plan for shared spec `008`, which amends spec 001 FR-025/026/030/031 (per FR-RG-012). It adds the **date dimension** on top of the machinery specs 006 (planned/cooked entry state + quantity netting, FR-MC-016..018) and 007 (purchase receipts + tick/un-tick + receipt-aware checkout) already shipped: meal-plan entries dated before today stop contributing needs, and the list re-scopes itself to today→end-of-week every time it is viewed.

## Summary

Make the grocery list a **rolling rest-of-week list** in three independently testable increments matching the spec stories, plus a cascade phase. **RG1** adds date-scoped generation — only `planned` entries dated today-or-later contribute needs — reconciled in place so surviving generated rows keep stable ids while zeroed ones are removed and partial ones requantified; delivered first behind the existing force-`generate` action. **RG2** adds same-day integrity and the daily shed: manual and purchased rows carry a day anchor, survive every same-day refresh untouched (receipt intact), and are pruned at the next rollover, with the purchased inventory left intact. **RG3** wires the recompute onto every `GET` (recompute-on-view) so the list is current with zero manual steps. **RG4** verifies, cascades spec 001 + `CLAUDE.md`, and hands off. No new document type, no scheduler, no new npm dependencies — "rolling" is computed presentation over the existing week-keyed `GroceryList`.

## Technical Context

**Language/Version**: TypeScript (strict) on Node 20 / React 18 / Next.js 15 App Router — one process on `:3000`.
**Primary Dependencies**: existing only — Mongoose 8, Zod, Tailwind, `lucide-react`. **No new npm dependencies**. No cron/scheduler/queue infrastructure (recompute-on-view is a clarified user decision, FR-RG-002).
**Storage**: MongoDB via Mongoose — extends the `grocery_lists.items` subdocument with day-anchor stamps (`addedOn`, `purchasedOn`). Reuses `meal_plans` and `inventory_items` read-only. No schema change to `MealPlan`; no new collection.
**Testing**: Vitest node-env harness (`tests/server/`, `mongodb-memory-server`) — `tests/server/unit/rolling-grocery.test.ts` for the date-scope/reconcile/shed lib, `tests/server/grocery-lists.test.ts` extended for GET/generate rolling behaviour and same-day integrity through the controller; RTL for any view/context copy changes. Time is controlled with `vi.useFakeTimers()`/`vi.setSystemTime()` to cross the midnight boundary deterministically.
**Target Platform**: existing web app (mobile-first, 320–1920px); single-user LAN deployment.
**Project Type**: web — single `packages/client` package (UI + Route Handlers + `src/server`).
**Performance Goals**: recompute-on-view stays O(entries + items); one date-scoped generation per view; no extra round trips (the client already GETs on mount/week-change).
**Constraints**: server modules start with `import 'server-only'`; extensionless `@server/*` imports; thin handlers over controllers; Problem JSON via `problem()`/`withRoute`; complexity ≤10; no new state library; never write `expirationStatus`; `notExpiredQuery()` still gates netting stock; recommendation cache is unaffected (rolling recompute changes no inventory).
**Scale/Scope**: single-household lists; one small day-stamp per sticky row; recompute reads one meal plan + the user's non-expired inventory (already loaded for generation today).

## Constitution Check

*Gate evaluated against root `constitution.md` + `CLAUDE.md` §7/§8/§14. Re-check after Phase 1 design: PASS.*

- **Strict typing / no `any` / explicit return types** PASS — day-anchor fields and the `asOf` scoping parameter are typed in server/client grocery-list types; the reconcile helper returns a typed `IGroceryListItem[]`.
- **TDD** PASS — every story phase starts with failing tests citing FR-RG numbers before implementation; the midnight boundary is exercised with fake timers.
- **Coverage ≥70% client** PASS — the rolling lib (date-scope + reconcile + shed) is unit-tested; the controller GET/generate paths get handler tests; the full suite remains the final gate.
- **Context + hooks only** PASS — no client state changes beyond existing `GroceryListContext`; recompute is server-side, surfaced through the existing `refresh()`/`generate()`.
- **Mobile-first, WCAG 2.1 AA** PASS — no new interactive surface; rows shed silently. Any "list re-scoped to today" copy is text, not color-only.
- **API-first, RFC 7807, versioned paths, rate limiting** PASS — the three endpoints keep their paths and rate-limit tiers; `GET` gains recompute semantics; `generate` gains scope; the 007 `PATCH`/`complete` surfaces are unchanged.
- **No duplicate date logic** PASS — the today/midnight cutoff reuses the existing midnight-cutoff convention from `lib/expiration.ts`; the plan adds one small `asOf`-cutoff helper rather than a second date model (see Research D3).
- **`expirationStatus` never set manually** PASS — rolling recompute never creates or edits inventory items; netting reads `notExpiredQuery()` stock only.
- **Branch discipline** PASS — spec came from the shared spec branch; planning/tasks are per-branch `impl/nextjs` artifacts. Spec 001 FR revisions land on `main` (FR-RG-012).

## Project Structure

### Documentation (this feature)

```text
specs/008-rolling-grocery-refresh/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rolling-grocery-api.md
└── tasks.md            # authored in a later step, not here
```

### Source Code (repository root)

```text
packages/client/
├── app/api/v1/grocery-lists/[weekStart]/
│   ├── route.ts                     # GET — now recompute-on-view (unchanged handler shape)
│   └── generate/route.ts            # POST — force recompute, same rolling path
├── src/
│   ├── server/
│   │   ├── controllers/grocery-lists.ts     # getGroceryList + regenerateGroceryList call one reconcile path
│   │   ├── lib/
│   │   │   ├── grocery-list-generator.ts    # generateGroceryList gains an `asOf` date scope (FR-RG-001/003)
│   │   │   ├── rolling-grocery.ts           # NEW — startOfTodayCutoff(), reconcileRollingList(), shed
│   │   │   └── expiration.ts                # reused midnight-cutoff convention (read-only)
│   │   ├── models/grocery-list.ts           # item subdoc gains addedOn / purchasedOn
│   │   └── types/grocery-list.ts            # IGroceryListItem day-anchor additions (source of truth)
│   ├── types/grocery-list.ts                # client mirror of day-anchor fields
│   ├── context/GroceryListContext.tsx       # unchanged actions; recompute is server-side
│   └── views/GroceryListPage.tsx            # optional "re-scoped to today" affordance copy only
└── tests/
    ├── server/unit/rolling-grocery.test.ts  # NEW — date-scope, reconcile, shed, boundary
    └── server/grocery-lists.test.ts         # extended — GET/generate rolling + same-day integrity
```

**Structure Decision**: everything lands in the existing single `packages/client` app. The date-scope/reconcile/shed logic is a pure server lib (`rolling-grocery.ts`) so it is unit-tested without HTTP and shared verbatim by `getGroceryList` (recompute-on-view) and `regenerateGroceryList` (force). `generateGroceryList` only gains an `asOf` scope parameter; the controller owns document reconciliation (which rows are sticky vs replaceable, and the shed). No new document type: the week-keyed `GroceryList` is retained and its *content* becomes a function of the viewing day.

## Phase breakdown (each phase ends runnable + tests green; phases = spec stories)

1. **RG1 — Past meals stop generating needs (US1/P1, MVP).** Add `asOf: Date` to `generateGroceryList` so only `planned` entries dated today-or-later contribute (FR-RG-001); netting/servings-fallback rules are unchanged inside the smaller scope (FR-RG-003). Add `rolling-grocery.ts` with `startOfTodayCutoff()` (server clock, Research D3) and `reconcileRollingList()` that diffs freshly generated needs against the stored generated-unpurchased rows **by `ingredientName`** — preserving `_id` where the name survives (requantify + re-source, FR-RG-007), dropping zeroed rows (FR-RG-006), inserting new ones. Wire it into `regenerateGroceryList` first (force path). Independent test: plan across the week, let a planned day pass, force-regenerate → only today-onwards needs remain, with quantities and `sourceMealNames` re-scoped.
2. **RG2 — Same-day integrity + daily shed (US2/P2).** Add `addedOn`/`purchasedOn` day-stamps to the item subdoc and set them (manual add → `addedOn`; tick → `purchasedOn`, in `purchaseGroceryItem`). `reconcileRollingList` now treats manual and receipted/purchased rows as **sticky**: preserved byte-for-byte when their anchor day is today (FR-RG-004/005), pruned (shed) when the anchor day is before today. Shedding drops the row and its receipt; the inventory item is never touched (FR-RG-005/011). Legacy sticky rows lacking an anchor are lazily stamped to the recompute day (Research D5) so none are surprise-dropped. Independent test: tick + add manual, refresh repeatedly same day (rows intact, un-tick reverses exactly), advance clock past midnight, refresh → both rows shed, inventory intact, no re-listing.
3. **RG3 — Current without manual regeneration (US3/P3).** Change `getGroceryList` to call the same `reconcileRollingList` path on **every** view instead of only when the document is absent (recompute-on-view, FR-RG-002/008). Manual and force refresh now produce identical lists (FR-RG-002 scenario 2). Future-week views count all their meals (all dates ≥ today). Independent test: last computed yesterday → open today → needs reflect today's scope with no explicit action; cook/tick → next view shows the reduced need (SC-RG-002/004).
4. **RG4 — Verify + cascade + handoff.** Full lint/test/build/e2e gates; spec 001 cascade on `main` (FR-025 date-scoped rolling, FR-026 in-scope aggregation, FR-030/031 day-scoped persistence + same-day reversal window — FR-RG-012); `CLAUDE.md` §4 grocery-endpoint + §5 model notes updated; `tasks.md` closed only after tests pass. Leave release/tag/Portainer items unchecked for the Claude/human release flow.

## Complexity Tracking

*No constitution violations to justify.* Key judgments: **(a)** rolling is computed over the existing week-keyed document — no new "rolling list" entity — so specs 006/007 flows keep operating on real stored rows with stable ids; **(b)** generated rows are reconciled by `ingredientName` rather than wiped-and-recreated, so surviving lines keep their `_id` and mid-view ticks stay valid (FR-RG-011); **(c)** "today" is derived once, server-side, and the shed is a **write-time prune** during recompute (not a read-only filter) so the stored document converges to the rolling view every view; **(d)** `generateGroceryList` gains only a scope parameter — the netting/servings-fallback engine (FR-MC-016..018 / FR-026) is reused unchanged.

## Risks & mitigations

- **Local vs UTC midnight mismatch** → meal-plan entry dates are authored at **UTC** midnight (`getWeekDays`), while `lib/expiration.ts` cuts over at **local** midnight. The cutoff maps the user's local calendar day onto the entries' UTC-midnight axis (Research D3); a focused boundary test with `vi.setSystemTime()` at 23:59 and 00:01 guards the off-by-one.
- **`GET` now mutates on every view** → recompute-on-view persists the reconciled document (extending 007's lazy upsert). Generated rows keep their `_id` via name-reconcile, so a tick issued from a prior render still targets a live row; a tick that loses to an intervening recompute already refetches on 404/409 (existing `GroceryListContext` handling).
- **Sticky-row churn under refresh race (FR-RG-011)** → same-day preservation keys on the row (its stamp + receipt), never on regeneration order; a refresh between tick and un-tick leaves the receipt attached because reconcile copies sticky rows verbatim. Tests fire a recompute between a tick and its un-tick.
- **Shed drops the reversal window** → after the anchor day passes the row (and receipt) is pruned; un-tick then 404s and reversal is not offered (FR-RG-005). Accepted per the daily-reset clarification; the inventory addition is final and untouched.
- **Legacy rows without anchors dropped unexpectedly** → missing `addedOn`/`purchasedOn` is lazily backfilled to the recompute day, so pre-008 sticky rows survive their first rolled-over day rather than vanishing (Research D5).
- **Fully-past week** → once every day of `weekStart` is before today, generated needs compute to empty and the client's default view is the current week (Research D1); fully-past weeks are not maintained as history (FR-RG-009).

## Out of scope

Background/scheduled regeneration (recompute-on-view only); sub-day mealtime semantics (a today-dated meal counts all day, FR-RG-010); a user-facing purchase-history view (receipts need not survive shed); un-tick after shed / after a completed list; carrying manual items across days; `impl/vite` implementation; release tags and Portainer deployment.
