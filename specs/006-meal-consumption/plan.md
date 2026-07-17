# Implementation Plan: Inventory-Grounded Meal Consumption (`impl/nextjs`)

**Branch**: `impl/nextjs` · **Date**: 2026-07-18 · **Spec**: [`spec.md`](spec.md)
**Input**: Feature specification from `specs/006-meal-consumption/spec.md`

> **Per-branch plan** (not on `main`). This is the `impl/nextjs` enforcement of the shared, topology-agnostic spec `006`. The `impl/vite` implementation is deferred by decision (same convention as 003/004/005). The spec, its checklists, and the FR-MC-020 cascade into spec 001 are shared artifacts owned by `main` (the cascade is already authored in the spec-006 PR).

## Summary

Close the plan→cook→inventory loop in four independently shippable increments matching the spec's stories: **MC1** the meal-recommender returns inventory-grounded quantified ingredients (`{inventoryItemId, name, quantityToConsume, unit}`) which the server validates as untrusted against live inventory with tiered resolution (item-ID → fuzzy name → learned alias pairing, LLM-assisted, cached — no embeddings); **MC2** deduction moves from `addMealEntry` to an explicit, atomic, idempotent cooked confirmation (`status: planned|cooked` + consumption review with user-adjustable amounts); **MC3** consumption receipts (incl. depleted-item snapshots) make un-cook restore exactly; **MC4** the grocery generator becomes quantity-aware for grounded lines (net off owned non-expired stock via the existing `netNeeded`), servings fallback per line.

## Technical Context

**Language/Version**: TypeScript (strict) on Node 20 / React 18 / Next.js 15 App Router — one process on `:3000`
**Primary Dependencies**: existing only — Mongoose 8, Zod, Tailwind, `lucide-react`. **No new npm dependencies** (the tier-3 alias lookup calls the OpenAI REST API with `fetch`, mirroring `services/parse-assist.ts`)
**Storage**: MongoDB via Mongoose — extends the `meal_plans` entry subdocument (status/cookedAt/receipt) and the spec-005 `ingredient_aliases` collection (adds the learned inventory pairing — the reuse it was named for); no new collection
**Testing**: Vitest — `tests/server/` (`// @vitest-environment node`, `mongodb-memory-server`, handler-through-controller for the PATCH lifecycle + grounding), `tests/server/unit/` (grounding lib, consumption v2, generator), `tests/components/`/`tests/context/` (review sheet, cooked tile, contexts); coverage ≥70% client
**Target Platform**: the existing web app (mobile-first, 320–1920px)
**Project Type**: web — single `packages/client` package (UI + Route Handlers + `src/server`)
**Performance Goals**: grounding adds no extra recommendation round-trips (schema rides the existing agent call, FR-MC-005); cook/un-cook are single-document conditional updates + a handful of inventory writes; grocery netting stays O(items)
**Constraints**: server layer Node-only (`import 'server-only'`), extensionless `@server/*` imports, Problem JSON errors, `withRoute` + `authenticate()` + `rateLimit()` on every handler, complexity ≤10, **no embeddings/vector store (CLAUDE.md §14)**, never set `expirationStatus` manually (Mongoose hook owns it — matters for receipt-restore recreating items)
**Scale/Scope**: single-household users; receipts are small embedded arrays (≤ ~15 lines per meal); alias pairings ≤ a few hundred per user

## Constitution Check

*Gate evaluated against the root `constitution.md` (v3.1.0, source of truth) + CLAUDE.md §7/§14. Re-checked after Phase 1 design: PASS.*

- **Strict typing / no `any` / explicit return types** ✓ — new `GroundedIngredient`/receipt types flow through `src/server/types` + `src/types`; agent output validated by zod before use.
- **TDD** ✓ — every story starts with failing node-env tests citing FR-MC numbers (grounding corpus, cook/un-cook lifecycle incl. idempotency + depletion-resurrection, generator netting cases from the spec scenarios).
- **Coverage ≥70% client** ✓ — pure libs (grounding, consumption v2, generator) are cheap to cover; review sheet + tile states via RTL.
- **Context + hooks only** ✓ — cook/un-cook actions live in the existing `MealPlanContext`; review state is component-local.
- **Mobile-first, WCAG 2.1 AA** ✓ — review sheet amounts use ≥44px steppers + numeric inputs with labels; cooked state conveyed by icon + text, not color alone.
- **API-first, RFC 7807, versioned paths, rate limiting** ✓ — one new route `PATCH /api/v1/meal-plans/[weekStart]/entries/[slotId]` (100/min default), thin handler over the controller; existing routes keep their contracts (bodies unchanged; consumption side-effects removed).
- **No embeddings/vector store (§14)** ✓ — tier-2 is the existing deterministic `ingredient-matcher`; tier-3 is a single cached structured-output completion persisted per-pair in `ingredient_aliases`.
- **`expirationStatus` never set manually (§14)** ✓ — receipt-restore recreates depleted items via `new InventoryItem(snapshot).save()` so the pre-save hook recomputes status; snapshots deliberately exclude `expirationStatus`.
- **Branch discipline** ✓ — code on `impl/nextjs` lineage; spec 001 cascade + shared checklist edits live on `main` (already in the spec-006 PR); this plan/tasks stay per-branch.

## Project Structure

### Documentation (this feature)

```text
specs/006-meal-consumption/
├── spec.md              # shared contract (on main)
├── plan.md              # this file (per-branch, impl/nextjs)
├── research.md          # Phase 0 — decisions D1–D9
├── data-model.md        # Phase 1 — entry lifecycle, receipts, grounded ingredients, alias pairing
├── quickstart.md        # Phase 1 — dev/test walkthrough
├── contracts/
│   └── meal-consumption-api.md  # Phase 1 — PATCH entries + revised recommendation payload
└── tasks.md             # Phase 2 (/speckit.tasks — not created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/client/
├── app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route.ts
│                                      # MC2/MC3: adds PATCH (cook/un-cook) beside existing DELETE
├── src/
│   ├── types/meal-recommendation.ts   # MC1: + groundedIngredients?: GroundedIngredient[]
│   ├── types/meal-plan.ts             # MC2: + status/cookedAt/consumedItems on entries (client mirror)
│   ├── services/meal-plans.ts         # MC2/MC3: cookEntry()/uncookEntry() fetch wrappers
│   ├── context/MealPlanContext.tsx    # MC2/MC3: cook/un-cook actions + optimistic entry state
│   ├── components/calendar/
│   │   ├── MealDetailModal.tsx        # MC2: "Mark cooked" → review; cooked view shows receipt (FR-MC-015) + un-cook
│   │   ├── ConsumptionReviewSheet.tsx # MC2 (new): pre-filled adjustable amounts, zero allowed (FR-MC-009)
│   │   └── PlannedMealTile.tsx        # MC2: cooked visual state
│   └── server/
│       ├── types/meal-plan.ts         # MC2: entry status/cookedAt/receipt types
│       ├── types/meal-recommendation.ts # MC1: GroundedIngredient (server source of truth)
│       ├── models/meal-plan.ts        # MC2: entry subdoc schema + receipt subdoc
│       ├── models/ingredient-alias.ts # MC1: + inventoryName pairing field (spec-005 model, planned reuse)
│       ├── lib/ingredient-grounding.ts # MC1 (new): zod validation + tiered resolution + clamping
│       ├── lib/ingredient-consumption.ts # MC2/MC3: v2 — consumeConfirmed()→receipt, restoreFromReceipt()
│       ├── lib/grocery-list-generator.ts # MC4: grounded-quantity needs + netting, servings fallback
│       ├── services/alias-pairing.ts  # MC1 (new): cached LLM name→inventory-item lookup (parse-assist pattern)
│       ├── services/meal-recommender.ts # MC1: accept + pass through extended agent payload
│       └── controllers/
│           ├── recommendations.ts     # MC1: ground meals post-agent (before cache write)
│           ├── meal-plans.ts          # MC2/MC3: PATCH cook/un-cook; strip consumption from POST/DELETE/PUT
│           └── grocery-lists.ts       # MC4: pass full entries (incl. status) to the generator
├── agents/meal-recommender/
│   ├── agent.yaml                     # MC1: test-case expectations for grounded output
│   └── instructions/system-prompt.md  # MC1: revised response format (grounded usesIngredients)
└── tests/
    ├── server/unit/ingredient-grounding.test.ts   # MC1: tier corpus + hostile-input cases
    ├── server/unit/ingredient-consumption.test.ts # MC2/MC3: v2 consume/restore incl. snapshots
    ├── server/unit/grocery-list-generator.test.ts # MC4: netting scenarios from the spec
    ├── server/meal-plans.test.ts                  # MC2/MC3: PATCH lifecycle through real handlers
    ├── server/recommendations.test.ts             # MC1: grounding through the endpoint (mocked agent)
    └── components/…                               # MC2: review sheet, cooked tile, modal receipt view
```

**Structure Decision**: everything lands in the existing single `packages/client` package following the thin-handler/extracted-controller pattern. The one new route is the entry-level PATCH; grounding and consumption are pure server libs so they test without HTTP. Agent files change in-repo (`agents/meal-recommender/`) — an `agent-v*` image release accompanies the app release.

## Phase breakdown (each phase ends runnable + tests green; phases = spec stories)

1. **MC1 — Grounded suggestions (US1/P1, MVP).** Revise the agent contract: system prompt's `usesIngredients` becomes objects `{inventoryItemId, name, quantityToConsume, unit}` (inventory JSON already carries `_id`/quantity/unit); keep `expiringIngredients`/`missingIngredients` as names. Server: `GroundedIngredient` type + `ingredient-grounding.ts` — zod-validate the untrusted payload, resolve per tier (1: `_id` lookup scoped to `userId`; 2: `normalizeIngredientName` match against live inventory; 3: `alias-pairing` — `ingredient_aliases.inventoryName` hit, else one cached `gpt-4o-mini` structured-output call, persisted; unresolved → `resolution:'unresolved'`, moved to missing), clamp amounts to owned via `unit-normalizer`. Wire into `controllers/recommendations.ts` after the agent call (fallback/popular meals pass through ungrounded). Back-compat: legacy `usesIngredients: string[]` is derived from grounded names so every existing consumer keeps working. **Ship-ready alone** (truthful uses/missing display).
2. **MC2 — Cook-time consumption (US2/P2).** Model: entry subdoc gains `status` (`'planned'|'cooked'`; **missing = legacy = cooked**, FR-MC-011 — no migration script), `cookedAt`, `consumedItems`. New `PATCH …/entries/[slotId]` with `{action:'cook', consumption:[…]}` — the atomic idempotent guard is a single conditional `findOneAndUpdate` (`entries.slotId` + `status:'planned'` via `arrayFilters`) so a second submission finds no planned entry → 409/no-op. Consumption v2: `consumeConfirmed()` deducts the user-confirmed amounts (clamped live), returns the receipt; **remove** `consumeIngredients` from `addMealEntry`, restore from `deleteMealEntry`, net-diff from `replaceMealEntries` (PUT preserves server-held `status`/`cookedAt`/`consumedItems` for surviving slotIds and ignores client-sent lifecycle fields). Invalidate the recs cache on cook (today only the inventory controller does). UI: review sheet from the detail modal (pre-filled, adjustable, zero allowed), cooked tile state, context actions.
3. **MC3 — Receipts & exact reversal (US3/P3).** Receipt lines carry `{inventoryItemId, name, quantityConsumed, unit}` + `depletedSnapshot` (name/quantity/unit/category/location/expiresAt — **not** `expirationStatus`) when deduction removed the item. `PATCH {action:'uncook'}`: conditional guard on `status:'cooked'` **and** `consumedItems` present (legacy cooked entries → 409 `cannot un-cook`, FR-MC-011); restore quantities, re-create depleted items via `save()` (hook recomputes status), clear receipt, back to `planned`; recs cache invalidated. Cooked-entry DELETE keeps consumption (FR-MC-014) — delete stays side-effect-free from MC2 on. Modal shows the receipt on cooked entries (FR-MC-015).
4. **MC4 — Quantity-aware groceries (US4/P4).** Generator v2: consider only `status:'planned'` entries (cooked meals' needs are history; date-based exclusion stays backlog #4); for grounded ingredients sum `quantityToConsume` per canonical name and net owned non-expired stock via the existing `netNeeded` (shortfall > 0 → real-amount line; fully covered → omitted); ungrounded/missing ingredients keep the servings model per line (existing Phase C already handles incompatibility by falling through). FR-008 honoured by the existing `notExpiredQuery` inventory feed. Manual items/purchase flags untouched (regeneration already preserves them in the controller).
5. **MC5 — Verify + cascade + release.** `npm run lint`, `npm test`, `next build`, `bash scripts/validate-e2e.sh --no-agent`; Playwright: plan → cook (adjust an amount) → inventory reflects → un-cook restores → grocery netting visible; agent eval run for the revised prompt (`agent.yaml` test case). Doc cascade (per-branch): CLAUDE.md §4 endpoint table + §5 MealPlan model + §9 agent schema note; roadmap tick on `main`. Release: `nextjs-v4.4.0` + `agent-v*` images, Portainer redeploy (manual).

## Complexity Tracking

*No constitution violations to justify.* Judgment calls: **(a)** receipts embedded on the entry rather than a separate collection — they are 1:1 with a cooked entry, small, and die with the plan; a collection would add joins for nothing. **(b)** Missing `status` interpreted as `cooked` instead of a data migration — zero-downtime cutover, matches FR-MC-011, and new writes always set the field explicitly. **(c)** Agent-schema change instead of a second grounding LLM pass — FR-MC-005 forbids added round-trips; the agent already receives `_id`/quantity/unit.

## Risks & mitigations

- **Agent returns malformed/hostile grounded payloads** (wrong IDs, other users' IDs, absurd amounts) → zod + per-tier validation is the only path in; IDs are looked up `{_id, userId}`-scoped; non-positive/absurd amounts are dropped/clamped (FR-MC-002); the grounding corpus includes hostile cases.
- **Prompt-schema regression breaks parsing for older cached/stored meals** → grounding is additive: `usesIngredients` string[] remains derivable; meal snapshots stored in plans are `Schema.Types.Mixed`, so old and new shapes coexist; cook-time falls back to legacy 1-unit name matching for ungrounded snapshots (FR-MC-009).
- **Double-deduction under concurrency/retry** → the planned→cooked transition is one conditional single-document update; consumption runs only on a successful transition; handler tests fire the PATCH twice and assert one deduction (SC-MC-003).
- **PUT (drag-move) silently wiping cooked state/receipts** → controller merges lifecycle fields from the stored plan by `slotId` before `$set`; tests cover drag-move of a cooked entry.
- **Restore drift** (inventory changed between cook and un-cook) → restore adds quantities back rather than setting absolutes, and re-creates depleted items from snapshots; receipts record actual (clamped) deductions so restore is exact w.r.t. what was taken.
- **Grocery regressions for ungrounded flows** → generator keeps the servings path as the per-line fallback; the existing generator test suite must stay green before netting cases are added.
- **Agent image drift in prod** → the app tolerates both schema versions (see above), so app and agent images can roll independently; release notes pin the pairing.

## Out of scope

The `impl/vite` implementation (deferred by decision); backlog #3 (purchase → inventory at check-off) and #4 (daily rolling grocery refresh — the `status:'planned'` filter here is its prerequisite, not its delivery); serving-size scaling; receipt editing; nutrition/history analytics; metric/imperial display preference.
