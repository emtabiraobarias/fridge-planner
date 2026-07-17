# Tasks: Intelligent Quick-Add Understanding (`impl/nextjs`)

**Input**: Design documents from `/specs/005-intelligent-quick-add/` (plan.md, spec.md, research.md, data-model.md, contracts/quick-add-api.md, quickstart.md)
**Tests**: INCLUDED — TDD is mandatory (constitution §II / CLAUDE.md §8); every story phase starts with failing tests.
**Organization**: Phases map 1:1 to spec user stories (US1–US4 = plan phases IQ1–IQ4) + polish (IQ5). All paths relative to repo root.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4, mapping to spec.md user stories

## Phase 1: Setup

**Purpose**: Confirm the baseline before touching the parser — no scaffolding needed (existing app, zero new dependencies).

- [x] T001 Run `npm run lint && npm test` at repo root and record the green baseline (existing parser tests in `packages/client/tests/lib/` must pass untouched); pin the current spec-004 worked-example corpus as a "legacy behaviour" describe block in `packages/client/tests/lib/quick-parse.test.ts` with injected `TODAY = new Date(2026, 6, 12)` so IQ1 cannot regress it

---

## Phase 2: Foundational

*No foundational tasks — all stories build on the existing app; the shared provenance type is introduced by US1 (T002/T005), which every later story depends on. US1 is the de-facto foundation.*

---

## Phase 3: User Story 1 — Say it once, in plain words (Priority: P1) 🎯 MVP

**Goal**: Deterministic parser extensions in the pure client lib — explicit locations, unit synonyms, expiry vocabulary + year rollover, trailing quantity, comma multi-item — applied to both quick-add entry points (FR-IQ-001..009).

**Independent Test**: type the corpus phrases into the Kitchen and Groceries quick-adds and verify every extracted field (quickstart.md "IQ1" smoke); `tests/lib/quick-parse.test.ts` green.

### Tests for User Story 1 (write first, must FAIL)

- [x] T002 [US1] Add failing corpus tests to `packages/client/tests/lib/quick-parse.test.ts` covering FR-IQ-001..006 + spec edge cases: explicit location w/ override ("chicken thighs in the freezer", "bread in the freezer"), unit synonyms ("500 grams mince", "2 kilos …", "1 litre …"), expiry keywords/tokens ("use by tomorrow", "best before friday", "expires today", "exp 16 july", "jul 16"), dd/mm year rollover ("expires 2/1" on 17 Jul → next year), trailing quantity ("milk 2L", "eggs x6", leading-beats-trailing), multi-item `parseQuickAll` ("milk 2L, 6 eggs, sourdough"; "milk,, 12," skips), "frozen peas" name preserved, "1 can crushed tomatoes" (unit) vs "a can of beans" (no leading digit → sensible name), "cheese expires someday" leaves expiry unset without corrupting the name, per-field provenance assertions (explicit vs guess)

### Implementation for User Story 1

- [x] T003 [US1] Extend `packages/client/src/lib/quick-parse.ts` with `extractLocation` (valid location names, optional "in the/in/to the" prefix, clause-edge bare word; strips phrase from name; sets `location` provenance `explicit`; never strips category keywords like "frozen" inside a name) and the unit-synonym table (gram/grams→g, kilo(s)/kilogram(s)→kg, litre(s)/liter(s)→L, millilitre(s)→ml, piece(s)→pcs, packet(s)→pack, tin(s)→can, bottle(s)→bottle as a new canonical display unit — units are display vocabulary, not an enum, per spec FR-IQ-002/Assumptions) normalising inside `extractQuantity`
- [x] T004 [US1] Extend expiry parsing in `packages/client/src/lib/quick-parse.ts`: keywords `use by|use-by|best before|expires|exp`; tokens `today`, `tomorrow`, month-name dates ("16 july", "jul 16"); dd/mm rollover to next year when past (FR-IQ-004); unresolvable token → expiry unset, clause cleanly kept/dropped without half-stripping
- [x] T005 [US1] Add trailing-quantity extraction (leading wins when both) and `parseQuickAll(text): ParsedQuickItem[]` (comma split, skip empty/bare-number segments) with per-field `provenance` (`explicit`/`guess`) on the result type in `packages/client/src/lib/quick-parse.ts`; keep `parseQuick` + existing helper exports source-compatible for current call sites
- [x] T006 [US1] Wire Kitchen multi-add: `packages/client/src/components/inventory/QuickAdd.tsx` submit → `parseQuickAll` (loop `onAdd`), preview renders one chip row per item; update `packages/client/src/views/InventoryPage.tsx` handler if its `onAdd` signature changes
- [x] T007 [US1] Wire Groceries: `packages/client/src/views/GroceryListPage.tsx` quick-add (`grocAdd` path) → `parseQuickAll`; verify the `parseQuick(i.displayName)` location-default at checkout still compiles/behaves (FR-IQ-007)
- [x] T008 [US1] Update component tests for multi-add + new phrasings in `packages/client/tests/components/` (QuickAdd) and `packages/client/tests/views/` (InventoryPage, GroceryListPage); full suite + lint green

**Checkpoint**: US1 is a shippable MVP — corpus green, both screens parse the new grammar.

---

## Phase 4: User Story 2 — See what was understood, fix it in a tap (Priority: P2)

**Goal**: Provenance-styled preview chips with tap-to-correct on both quick-adds; corrections survive re-parse per research D3 (FR-IQ-010..014).

**Independent Test**: type "spinach" → category/location chips render tentative; tap location → pick pantry → saved item lands in pantry (quickstart "IQ2" smoke).

### Tests for User Story 2 (write first, must FAIL)

- [ ] T009 [P] [US2] Unit tests for the override-merge rule (keep while fresh parse still yields the replaced value; drop when it changes; overridden field renders/submits as explicit; overrides keyed by parsed item name so multi-item re-splits re-associate by name and drop with a vanished item — research D3) in `packages/client/tests/lib/quick-add-overrides.test.ts`
- [ ] T010 [P] [US2] Component tests for `ParsePreview` in `packages/client/tests/components/parse-preview.test.tsx`: confident vs tentative styling (not color-alone — dashed border/icon), chip = keyboard-operable button, popover pickers change the field, per-item rows for multi-item, corrected value included in submit payload

### Implementation for User Story 2

- [ ] T011 [US2] Implement the override store + merge rule as a pure helper in `packages/client/src/lib/quick-add-overrides.ts` (`applyOverrides(items, overrides)` returning items with `explicit` provenance on overridden fields; drop-rule per research D3)
- [ ] T012 [US2] Build `packages/client/src/components/shared/ParsePreview.tsx`: chip row per parsed item (name, qty+unit, category, location, expiry — plus a suggestion slot left empty until US3/T023 populates it), provenance styling, tap-to-correct popovers (category/location/unit listboxes from existing enums, quantity input, native date input for expiry), ≥44px targets, WCAG AA
- [ ] T013 [US2] Replace the display-only chips in `packages/client/src/components/inventory/QuickAdd.tsx` with `ParsePreview` + override state; corrected values flow into `onAdd`
- [ ] T014 [US2] Mount `ParsePreview` on the Groceries quick-add in `packages/client/src/views/GroceryListPage.tsx` (same component, same behaviour — FR-IQ-007)
- [ ] T015 [US2] Update existing QuickAdd/Grocery tests for the new preview; suite + lint green

**Checkpoint**: US1+US2 — full parse-preview-correct loop, still zero server changes.

---

## Phase 5: User Story 3 — It learns my kitchen (Priority: P3)

**Goal**: Per-user `ingredient_aliases` persistence + client alias cache; corrections and expiry-carrying adds teach it; learned defaults + one-tap expiry suggestions apply on future parses (FR-IQ-015..018).

**Independent Test**: correct "tortillas" to pantry once → re-type "tortillas" → pantry pre-applied as learned; second user unaffected (quickstart "IQ3" smoke).

### Tests for User Story 3 (write first, must FAIL)

- [ ] T016 [P] [US3] Server handler tests in `packages/client/tests/server/quick-add.test.ts` (`// @vitest-environment node`, `mongodb-memory-server`, real `Request` objects): GET empty → `{aliases: []}`; PUT upsert + field overwrite; 400 on non-enum category/location/unit and empty body; `observedShelfLifeDays` FIFO cap at 5; `suggestedShelfLifeDays` = median only when ≥2 observations; FR-036 isolation (user B never sees user A's aliases); 401 unauthenticated
- [ ] T017 [P] [US3] Client tests in `packages/client/tests/context/quick-add-context.test.tsx`: aliases load once and merge as `learned` provenance (explicit text still wins — "tortillas in the freezer" case); correction triggers PUT; expiry suggestion offered but not auto-applied

### Implementation for User Story 3

- [ ] T018 [P] [US3] Create Mongoose model `packages/client/src/server/models/ingredient-alias.ts` per data-model.md (unique compound index `(userId, nameKey)`, `expiryObservations` capped at 5, hot-reload guard, `import 'server-only'`)
- [ ] T019 [US3] Implement `packages/client/src/server/controllers/quick-add.ts`: `listAliases(userId)` (with median-derived `suggestedShelfLifeDays`) and `upsertAlias(userId, nameKey, patch)` returning `ControllerResult`, Zod validation, Problem JSON via `problem()`
- [ ] T020 [US3] Add Route Handlers `packages/client/app/api/v1/quick-add/aliases/route.ts` (GET) and `packages/client/app/api/v1/quick-add/aliases/[nameKey]/route.ts` (PUT, `await ctx.params`): `connectDb` → `authenticate` → `rateLimit` (100/min) → controller, wrapped in `withRoute`
- [ ] T021 [US3] Add browser service `packages/client/src/services/quick-add.ts` (`getAliases`, `putAlias` via the existing `apiFetch` Bearer wrapper)
- [ ] T022 [US3] Build `packages/client/src/context/QuickAddContext.tsx` + hook: lazy-load aliases on first quick-add focus, merge into parse results as `learned` (precedence explicit > learned > guess), record chip corrections + adds with explicitly typed/corrected expiry back via `putAlias` (suggestion-accepted expiries are NOT recorded — analyze U2); mount provider in `packages/client/app/providers.tsx`
- [ ] T023 [US3] Surface the one-tap expiry suggestion chip in `packages/client/src/components/shared/ParsePreview.tsx` (`suggestedExpiresAt` → applied only on tap, FR-IQ-017)
- [ ] T024 [US3] Full suite + lint green; verify no `src/server` import leaks into client bundle (`next build`)

**Checkpoint**: US1–US3 — the quick-add now personalises per user.

---

## Phase 6: User Story 4 — AI assist for the hard cases (Priority: P4)

**Goal**: Fail-open, cost-bounded AI fallback for low-confidence parses via `POST /api/v1/quick-add/parse` (FR-IQ-019..022).

**Independent Test**: with `OPENAI_API_KEY` set, "gochujang" upgrades from Other after a pause; with the key absent or network down, behaviour is byte-identical to US3 with no error shown (quickstart "IQ4" smoke).

### Tests for User Story 4 (write first, must FAIL)

- [ ] T025 [P] [US4] Server tests in `packages/client/tests/server/parse-assist.test.ts` (mock `global.fetch`): 200 with enum-valid interpretation; invalid fields dropped field-wise (FR-IQ-020); `interpretation: null` passthrough; 503 when `OPENAI_API_KEY` unset; TTL cache — second identical text does NOT re-fetch (FR-IQ-022); 429 beyond 20/min; 401 unauthenticated
- [ ] T026 [P] [US4] Client trigger tests in `packages/client/tests/context/quick-add-assist.test.tsx`: assist called only when merged `category === 'Other'` with a usable name; debounced; merges only into `guess` fields as `assisted`; 503/timeout/error → silent fail-open; submit never waits for in-flight assist

### Implementation for User Story 4

- [ ] T027 [P] [US4] Implement `packages/client/src/server/services/parse-assist.ts`: plain-`fetch` OpenAI Chat Completions call (`gpt-4o-mini`, JSON-schema structured output, short timeout), field-wise Zod gating against the exact Category/Location/unit enums, 1h in-memory TTL cache keyed by normalised text (pattern: `recommendations-cache`), `import 'server-only'`
- [ ] T028 [US4] Add `parseAssisted(text)` to `packages/client/src/server/controllers/quick-add.ts` + Route Handler `packages/client/app/api/v1/quick-add/parse/route.ts` (`authenticate` → `rateLimit` 20/min → controller → `withRoute`; 503 Problem JSON when unconfigured)
- [ ] T029 [US4] Client integration: add `assistParse` to `packages/client/src/services/quick-add.ts`; wire the debounced low-confidence trigger + `assisted` merge + fail-open handling into `packages/client/src/context/QuickAddContext.tsx`
- [ ] T030 [US4] Full suite + lint green

**Checkpoint**: all four stories functional; assistance strictly optional per deployment.

---

## Phase 7: Polish & Cross-Cutting (plan IQ5)

- [ ] T031 [P] Playwright coverage: extend `packages/client/e2e/` with quick-add flows on Kitchen + Groceries (parse → chips → correct → add; multi-item; 320px screenshot of the chip row) and commit screenshots per repo convention
- [ ] T032 Release gate: `npm run lint`, `npm test` (coverage ≥70%), `npm -w packages/client run build`, `bash scripts/validate-e2e.sh --no-agent` all green
- [ ] T033 Doc cascade **on `main`** (never from this branch): revise `specs/004-organic-redesign/design/reference-logic.md` §1 to the extended algorithm + full worked-example corpus (FR-IQ-009, satisfies SC-IQ-001/006 measurement base); update `ROADMAP_PROGRESS.md` (backlog #1 → done, LAST LEFT OFF); then `bash scripts/sync-impls.sh`
- [ ] T034 [P] Per-branch doc cascade on `impl/nextjs`: CLAUDE.md §4 endpoint table (+ rate limits) and §3 tree for `quick-add` routes/controller/model/service; note `OPENAI_API_KEY` now also powers quick-add assist in §6/.env.example if wording changed
- [ ] T035 Run the quickstart.md manual smokes end-to-end (IQ1–IQ4) against `npm run dev` + Mongo and record results in the roadmap LAST LEFT OFF entry

---

## Dependencies & Execution Order

- **Setup (T001)** → everything.
- **US1 (T002–T008)** is the foundation — **blocks US2/US3/US4** (they consume `ParsedQuickItem` provenance).
- **US2 (T009–T015)** depends on US1. **Blocks US3's write path** (corrections come from chips), though T016/T018–T021 (server side) only need US1 and can start in parallel with US2.
- **US3 (T016–T024)** depends on US1 (+US2 for the correction UI wiring in T022/T023).
- **US4 (T025–T030)** depends on US1 (+US3's context merge point in T029; the server side T025/T027/T028 is independent of US2/US3).
- **Polish (T031–T035)** after the last story you choose to ship; T033 runs on `main`.

### Parallel opportunities

- T009 ∥ T010 (different test files); T016 ∥ T017; T025 ∥ T026.
- US3 server side (T018→T019→T020) ∥ US2 UI work (T011–T014) once US1 lands.
- US4 server side (T027→T028) ∥ US3 client wiring.
- T031 ∥ T034 during polish.

## Implementation Strategy

**MVP = Phase 3 (US1) alone** — ship after T008 if desired (parser upgrade is user-visible immediately). Each later phase is an independently testable, independently shippable increment; release per increment via `nextjs-v*` tag + Portainer redeploy. Suggested first session: T001–T005 (pure-lib TDD, no UI churn); second session: T006–T008 + smoke.
