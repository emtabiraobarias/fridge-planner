# Implementation Plan: Intelligent Quick-Add Understanding (`impl/nextjs`)

**Branch**: `impl/nextjs` · **Date**: 2026-07-17 · **Spec**: [`spec.md`](spec.md)
**Input**: Feature specification from `specs/005-intelligent-quick-add/spec.md`

> **Per-branch plan** (not on `main`). This is the `impl/nextjs` enforcement of the shared, topology-agnostic spec `005`. The `impl/vite` implementation is deferred by decision (same convention as Phases F/G) and gets its own `plan.md` when built. Spec + `checklists/*` + the FR-IQ-009 canonical-algorithm revision are shared artifacts owned by `main`.

## Summary

Make the natural-language quick-add (Kitchen + Groceries, shared parser) reliably extract **name / quantity+unit / expiry / location** from free text, in four independently shippable increments matching the spec's stories: **IQ1** deterministic parser extensions in the pure client lib; **IQ2** tap-to-correct preview chips with per-field provenance; **IQ3** per-user learned aliases + one-tap expiry suggestions (new server capability); **IQ4** fail-open AI-assist fallback for low-confidence parses (new server endpoint, plain OpenAI structured-output call — **no Holodeck, no embeddings**).

## Technical Context

**Language/Version**: TypeScript (strict) on Node 20 / React 18 / Next.js 15 App Router — one process on `:3000`
**Primary Dependencies**: existing only — Tailwind, `lucide-react`, Mongoose 8, Zod, `jose`. **No new npm dependencies** (IQ4 calls the OpenAI REST API with `fetch`, mirroring `services/meal-recommender.ts`'s plain-fetch pattern)
**Storage**: MongoDB via Mongoose — one new collection `ingredient_aliases` (IQ3); named for reuse by roadmap backlog #2's ingredient↔inventory mapping
**Testing**: Vitest — `tests/lib/` (parser, jsdom), `tests/components/` (chips, RTL), `tests/server/` (`// @vitest-environment node`, `mongodb-memory-server`, handler-through-controller); coverage ≥70% client
**Target Platform**: the existing web app (mobile-first, 320–1920px)
**Project Type**: web — single `packages/client` package (UI + Route Handlers + `src/server`)
**Performance Goals**: as-you-type deterministic preview with no perceptible delay (pure sync client parse, FR-IQ-008 / SC-IQ-005); AI assist is async, debounced, and never blocks the add
**Constraints**: no state-management library (Context + hooks); server layer Node-only behind `import 'server-only'`; extensionless `@server/*` imports; Problem JSON errors; complexity ≤10 per function (parser stays decomposed into per-clause extractors)
**Scale/Scope**: single-household user base; alias memory is small per user (≤ a few hundred entries) — one indexed query per parse session, cached client-side in context

## Constitution Check

*Gate evaluated against the root `constitution.md` (v3.1.0, source of truth) + CLAUDE.md §7/§14. Re-checked after Phase 1 design: PASS.*

- **Strict typing / no `any` / explicit return types** ✓ — parser stays a pure typed lib; new server code follows existing controller typing.
- **TDD (tests before fix/feature)** ✓ — IQ1 is test-first against the FR-IQ corpus (the same worked examples that revise spec 004 `reference-logic.md` §1); server tests drive alias + parse endpoints through real handlers.
- **Coverage ≥70% client** ✓ — parser and chip components are cheap to cover; services layer excluded as today.
- **Context + hooks only, no Redux/Zustand** ✓ — alias cache lives in the existing `InventoryContext`/a small `QuickAddContext`; correction state is component-local.
- **Mobile-first, WCAG 2.1 AA** ✓ — chips are ≥44px tap targets, keyboard-operable (chip = button opening a listbox/popover), provenance conveyed by more than color (dashed border + icon, not hue alone).
- **API-first, RFC 7807, versioned paths, rate limiting** ✓ — new endpoints under `/api/v1/quick-add/*`, `withRoute` + `problem()`, `authenticate()` on every handler, `rateLimit()` per route (parse: 20/min; aliases: 100/min default).
- **No embeddings/vector store (§14)** ✓ — alias lookup is exact-key; AI assist is a single structured-output completion, cached and gated.
- **`expirationStatus` never set manually (§14)** ✓ — quick-add only ever sends `expiresAt`; the Mongoose hook computes status.
- **Branch discipline** ✓ — code on `impl/nextjs`; the FR-IQ-009 revision of `specs/004-organic-redesign/design/reference-logic.md` §1 is a **shared spec artifact → edited on `main`** and synced down (never edited from this branch).

## Project Structure

### Documentation (this feature)

```text
specs/005-intelligent-quick-add/
├── spec.md              # shared contract (on main)
├── plan.md              # this file (per-branch, impl/nextjs)
├── research.md          # Phase 0 — decisions D1–D7
├── data-model.md        # Phase 1 — IngredientAlias + client-side shapes
├── quickstart.md        # Phase 1 — dev/test walkthrough
├── contracts/
│   └── quick-add-api.md # Phase 1 — /api/v1/quick-add/* contract
└── tasks.md             # Phase 2 (/speckit.tasks — not created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/client/
├── app/api/v1/quick-add/
│   ├── aliases/route.ts               # IQ3: GET (list) — thin over controller
│   ├── aliases/[nameKey]/route.ts     # IQ3: PUT (upsert correction/observation)
│   └── parse/route.ts                 # IQ4: POST AI-assist parse (rate-limited 20/min)
├── src/
│   ├── lib/quick-parse.ts             # IQ1: extended parser (multi-item, provenance) — stays pure
│   ├── services/quick-add.ts          # IQ3/IQ4: browser fetch wrappers (aliases, assist)
│   ├── context/QuickAddContext.tsx    # IQ3: per-user alias cache + apply/record helpers
│   ├── components/inventory/QuickAdd.tsx        # IQ2: provenance chips + tap-to-correct
│   ├── components/shared/ParsePreview.tsx       # IQ2: chip row shared by Kitchen + Groceries
│   └── server/
│       ├── controllers/quick-add.ts   # IQ3/IQ4: aliases CRUD + assisted parse
│       ├── models/ingredient-alias.ts # IQ3: Mongoose model (unique userId+nameKey)
│       └── services/parse-assist.ts   # IQ4: OpenAI structured-output call + TTL cache
└── tests/
    ├── lib/quick-parse.test.ts        # IQ1: FR corpus (fixed TODAY injection)
    ├── components/…                   # IQ2: chip provenance + correction flows
    └── server/quick-add.test.ts       # IQ3/IQ4: handler tests (memory Mongo, mocked fetch)
```

**Structure Decision**: everything lands in the existing single `packages/client` package following the thin-handler/extracted-controller pattern; the parser remains a pure client lib so the as-you-type preview needs no network. Views wire-up touches `QuickAdd.tsx`, `GroceryListPage.tsx` (its inline quick-add + the `parseQuick` location-default at line 33), and `InventoryPage.tsx`.

## Phase breakdown (each phase ends runnable + tests green; phases = spec stories)

1. **IQ1 — Deterministic parser (US1/P1, MVP).** TDD: port the revised worked-example corpus into `tests/lib/quick-parse.test.ts` first. Extend `quick-parse.ts`: explicit-location extraction (`in the freezer|fridge|pantry`, bare location word at clause edge) with override; unit-synonym table → canonical units; expiry keywords (`use by`, `best before`) + tokens (`today`, `tomorrow`, month-name dates) + dd/mm year-rollover; trailing quantity; `parseQuickAll(text)` splitting on commas (skip empty/bare-number segments). Keep `parseQuick` signature working for existing call sites. Switch Kitchen + Groceries submit paths to `parseQuickAll`. **Ship-ready alone.**
2. **IQ2 — Correctable preview (US2/P2).** Add per-field provenance to the parse result (`explicit | guess`), render via new `ParsePreview` chips (confident vs tentative styling; multi-item = one row per item). Tap chip → popover (category/location/unit pickers, quantity input, expiry date picker). Correction overrides are component state; FR-IQ-014 merge rule per research D3. Wire the same component into the Groceries quick-add.
3. **IQ3 — Alias memory (US3/P3).** `ingredient-alias` model + `quick-add` controller + `aliases` routes; `QuickAddContext` loads the user's aliases once and merges them at parse time as `learned` provenance (precedence: explicit > learned > guess). Chip corrections and expiry-carrying adds PUT observations back. Expiry suggestion chip (median of ≥2 observations) applied only on tap (FR-IQ-017). Server tests cover FR-036 isolation.
4. **IQ4 — AI assist (US4/P4).** `parse-assist` service (OpenAI `gpt-4o-mini`, structured output, zod-validated to the exact enums, 1h in-memory TTL cache keyed by normalised text — same pattern as `recommendations-cache`); `POST /api/v1/quick-add/parse` (20/min). Client: debounce, fire only when category fell back to `Other` and no learned alias hit; merge as `assisted` provenance; fail-open on error/timeout (FR-IQ-021).
5. **IQ5 — Verify + cascade.** `npm run lint`, `npm test`, `next build`, `validate-e2e.sh --no-agent`; Playwright pass over quick-add flows on both screens. Doc cascade: revise spec 004 `reference-logic.md` §1 **on `main`** (FR-IQ-009 corpus), sync down; CLAUDE.md §4 endpoint table + §12 as needed; roadmap tick.

## Complexity Tracking

*No constitution violations to justify.* The single judgment call: **two new server endpoints + one collection** for IQ3/IQ4 where IQ1/IQ2 are frontend-only — justified because per-user learning requires persistence (FR-IQ-015/018) and the AI key must stay server-side (FR-IQ-019..022); both follow the existing controller/model pattern rather than any new architecture.

## Risks & mitigations

- **Parser regressions on existing inputs** → the current reference corpus stays green verbatim in the new test file before any extension lands (IQ1 is additive; "frozen peas" edge case pinned).
- **Chip UI crowding the mobile quick-add** → chips already exist visually (display-only today); IQ2 upgrades them in place, Playwright screenshot check at 320px.
- **Alias data quality drift** (stale/wrong learned values) → aliases only ever supply *tentative* defaults, one tap to override, never block a parse (FR-IQ-018); PUT upserts overwrite rather than accumulate.
- **AI-assist latency/cost** → debounced, low-confidence-only, cached 1h, 20/min limit, fail-open; deployment-optional (no `OPENAI_API_KEY` → endpoint returns 503, client treats as disabled).
- **Shared-doc discipline** → the FR-IQ-009 revision is authored on `main` only; this branch consumes it via sync (mirrors how spec 004 design docs are handled).

## Out of scope

The `impl/vite` implementation (deferred); backlog #2/#3 consumption/purchase flows (the `ingredient_aliases` collection is named for #2's future reuse but its meal-mapping logic is not built here); voice/barcode input; new categories/locations/units; classic-form parsing.
