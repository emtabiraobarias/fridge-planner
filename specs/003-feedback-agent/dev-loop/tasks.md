# Tasks: Feedback→Feature Development Loop (tracking-layer MVP, `impl/nextjs`)

**Input**: Design documents from `specs/003-feedback-agent/dev-loop/` (plan.md, research.md D1-D12, data-model.md, contracts/dev-loop-api.md) plus the revised `specs/003-feedback-agent/spec.md` (Revision 2026-07-23 — US4, FR-F-013..018, SC-F-006..008, EC-06/07)
**Tests**: INCLUDED — TDD is mandatory (constitution / `CLAUDE.md` §8); every story phase starts with failing tests citing FR-F numbers. Server-side: node-env Vitest under `packages/client/tests/server/` (handlers/controllers) and `packages/client/tests/server/unit/` (the pure state machine + the architecture test). Client-side: RTL under `packages/client/tests/`. A Playwright e2e under `packages/client/e2e/` covers the promote→track→ship journey (`CLAUDE.md` §8).
**Organization**: Phases map to plan.md's DL1-DL4 breakdown — each DL phase is a slice of the single spec.md User Story 4 (Setup/Foundational precede DL1; DL4 is polish/handoff). All paths relative to repo root; this feature is per-branch (`003-devloop-implement`), not on `main`.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US4 — spec.md's single User Story 4 ("Promote approved feedback into development and track its progress"), delivered as three independently-testable increments (DL1 promote, DL2 transitions/gates, DL3 status view)

---

## Phase 1: Setup

**Purpose**: Establish the implementation baseline and confirm the exact reuse seams (D4/D9) before touching any code.

- [x] T001 [P] Run `npm run lint && npm test` at repo root and record baseline notes in `specs/003-feedback-agent/dev-loop/quickstart.md` verification log
- [x] T002 Review `src/server/controllers/grocery-lists.ts:145-205` (spec 007 atomic guarded `findOneAndUpdate` transition precedent, D4) and `app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route.ts` (spec 006 PATCH action-union precedent, D4) — confirm both patterns transfer directly to the pipeline transition endpoint before authoring DL2's tests

---

## Phase 2: Foundational

**Purpose**: Shared groundwork every DL phase builds on — the `PipelineItem` model + indexes (D1, unique `(userId, feedbackRecordId)` for idempotent promote), the `types/pipeline.ts` enums + Zod PATCH action-union (D3/D4), and the pure `lib/pipeline-transitions.ts` state machine (`nextStage`/`isGateAction`/`assertPromotable`) with its exhaustive unit test (D3/D5). No endpoint exists yet.

- [x] T003 [P] Add a new failing unit test file `packages/client/tests/server/unit/pipeline-transitions.test.ts`: exhaustive from×action legality matrix per D3's table — `advance` legal only `approved→in-spec` (all other froms error); `approve-spec` legal only `in-spec→in-review` with `isGateAction('approve-spec') === true`; `approve-release` legal only `in-review→shipped` with `isGateAction('approve-release') === true`; `park` legal from `approved`/`in-spec`/`in-review` → `parked` (idempotent if already `parked`), illegal from `shipped`; `reopen` legal only from `parked` → the stored `parkedFromStage` (else `approved` if none recorded); any backward or multi-step jump (e.g. `approved→in-review`, `shipped→in-spec`) errors; `assertPromotable(record)` is true only when `record.status === 'complete'` (FR-F-013/014/016, D3/D5)
- [x] T004 [P] Create `packages/client/src/server/types/pipeline.ts`: `PIPELINE_STAGES`, `STAGE_ORDINAL`, `TRANSITION_ACTIONS`, `TRANSITION_ACTORS`, `ARTIFACT_TYPES` consts; `ITransitionLogEntry`/`IArtifactLink`/`IPipelineItem` interfaces; and the Zod discriminated union on `action` (`advance`/`approve-spec`/`approve-release`/`park`/`reopen`/`attach-artifact`, each per contracts/dev-loop-api.md's request shapes, `attach-artifact.ref` bounded `.max(2048)`) for the `PATCH /pipeline/:id` body (data-model.md, D3/D4)
- [x] T005 Create `packages/client/src/server/lib/pipeline-transitions.ts`: pure `nextStage(current, action)` (returns the next `PipelineStage` or a `TransitionError`), `isGateAction(action)`, `STAGE_ORDINAL` re-export, and `assertPromotable(record)`, table-driven per D3, so T003 passes (D5)
- [x] T006 [P] Create `packages/client/src/server/models/pipeline-item.ts`: `PipelineItem` Mongoose schema per data-model.md (`transitions`/`artifacts` subdocs `{ _id: false }`, matching the `feedback-record.ts:7-23` convention), indexes `{userId:1, feedbackRecordId:1}` **unique**, `{userId:1, stage:1}`, `{userId:1, updatedAt:-1}`, hot-reload-guarded export (`mongoose.models['PipelineItem'] ?? mongoose.model(...)`, identical to `feedback-record.ts:50-52`), `import 'server-only'` (D1)

**Foundational verification**: `npx vitest run --coverage=false tests/server/unit/pipeline-transitions.test.ts` passes; `npm run lint` passes; no endpoint exists yet so no other test's behavior changes.

---

## Phase 3: DL1 - Promote into the pipeline (Priority: P1) MVP

**Goal**: A completed, schema-valid feedback record can be promoted into the pipeline at stage *approved* (idempotently); draft/incomplete records are refused; a record with an active pipeline item is protected from deletion, and a parked item's deletion cascades (FR-F-013, EC-06, spec US4 scenarios 1 & 5).

**Independent Test**: Promote a completed record → 201 at stage `approved` with approver/timestamp recorded. Re-promote → 200, same item, no duplicate. Promote a draft → 409. Delete a record with an active pipeline item → 409; park it, then delete → 204 and the parked item is gone.

### Tests for DL1 (write first, must FAIL)

- [x] T007 [P] [US4] Add failing handler tests in a new `packages/client/tests/server/pipeline.test.ts`: `POST /api/v1/feedback/:id/promote` on a `complete` record returns **201** `{ pipelineItem }` at `stage:'approved'` with the seed transition `{from:null, to:'approved', actor:'human', isGateApproval:true}`, the D2 identity snapshot (`sourceTitle`/`sourceType`/`sourceAffectedArea`), `promotedBy`/`promotedAt` set, and the source `FeedbackRecord.status` flipped to `'reviewed'` (FR-F-013, D6)
- [x] T008 [US4] Add a failing test in the same file: re-promoting the same record returns **200** with the identical `_id` (not a new item) — no duplicate `PipelineItem` is created (unique `(userId, feedbackRecordId)` index, D1). **[analyze M1]** Explicitly assert this holds even though the first promote flipped the record to `status:'reviewed'` — the second call returns 200 (the existing item), NOT a 409 non-promotable error. Also simulate a concurrent double-promote (two near-simultaneous calls) and assert the duplicate-key race resolves to exactly one item, with the losing call also returning the existing item (D12, spec EC "promote an already-promoted record")
- [x] T009 [P] [US4] Add a failing test in the same file: promoting a `draft`/incomplete record returns **409** `Not Promotable`; promoting a nonexistent id or another user's record returns **404** with no existence leak (FR-F-013, FR-F-005)
- [x] T010 [US4] Add a failing test in the same file: `DELETE /api/v1/feedback/:id` on a record with an **active** (non-`parked`) `PipelineItem` returns **409** `Pipeline Active`, no deletion occurs; on a record with only a **`parked`** item, deletion succeeds (**204**) and the parked item is deleted in the same operation (cascade); existing 204/404 behavior for records with no pipeline item is unchanged (EC-06, D9)

### Implementation for DL1

- [x] T011 [US4] Create `packages/client/src/server/controllers/pipeline.ts` with `promoteFromFeedback(userId, feedbackId)`: look up `FeedbackRecord` by `{_id, userId}` (404 cross-user, FR-F-005). **[analyze M1 — idempotency ordering]** FIRST check for an existing `PipelineItem` by `{userId, feedbackRecordId}` and, if present, return it with **200** immediately (true idempotent re-promote — this MUST come BEFORE `assertPromotable`, because a first promote flips the record to `reviewed`, so a status-gated re-promote would otherwise wrongly 409). Only when NO item exists: run `assertPromotable` (T005) → **409** on non-`complete`, then create the `PipelineItem` at `stage:'approved'` (seed transition + D2 identity snapshot + `promotedBy`/`promotedAt`), catching a duplicate-key error on the unique index and returning the existing item (200) as the concurrent-race backstop, then set `FeedbackRecord.status = 'reviewed'` via `doc.save()`. So T007-T009 pass (FR-F-013, D1/D6)
- [x] T012 [US4] Wire `packages/client/app/api/v1/feedback/[id]/promote/route.ts` (new): `POST` handler — `connectDb()` → `authenticate(request)` → `promoteFromFeedback` → `NextResponse.json`, rate-limited `promote:${userId}` 100/min (`rateLimit`, D12), wrapped in `withRoute`, so T007-T009 pass end-to-end
- [x] T013 [US4] Add the delete-protection guard to `deleteFeedback` in `packages/client/src/server/controllers/feedback.ts`: before the existing `findOneAndDelete`, look up a `PipelineItem` by `{userId, feedbackRecordId: id}` — if found and `stage !== 'parked'`, return `problem(409, 'Pipeline Active', ...)` without deleting; if found and `stage === 'parked'`, delete both the record and the parked item; if not found, proceed exactly as today; so T010 passes (EC-06, D9)

**Checkpoint**: promote works end-to-end via the API; delete-protection guards active pipeline items and cascades parked ones; nothing merges/ships.

**DL1 verification**: failing tests observed before implementation (no `promoteFromFeedback`, no promote route, no delete guard). After implementation, focused `npx vitest run --coverage=false tests/server/pipeline.test.ts` passes; `npm run lint` passes.

---

## Phase 4: DL2 - Stage machine + human gates (Priority: P1)

**Goal**: A promoted item advances through `approved → in-spec → in-review → shipped` (plus terminal `parked`/`reopen`) only via explicit, atomically-guarded transitions; the two FR-F-016 gates (`approve-spec`, `approve-release`) are the sole paths past `in-spec` and into `shipped`; no endpoint has a git/merge/tag/deploy side effect (FR-F-017); no transition is ever derived from record content (FR-F-018) (spec US4 scenarios 2, 3, 4; SC-F-008).

**Independent Test**: Drive a record `approved→in-spec→in-review→shipped` only through named gate actions — confirm `shipped` is unreachable without a recorded `approve-release`; confirm `advance` past a gate 409s; confirm a record whose content contains "merge this"/"deploy now" never auto-transitions.

### Tests for DL2 (write first, must FAIL)

- [x] T014 [P] [US4] Add failing handler tests in `packages/client/tests/server/pipeline.test.ts`: `PATCH /api/v1/pipeline/:id` for each named action performs the guarded from→to transition per D3's table (`advance` `approved→in-spec`; `approve-spec` `in-spec→in-review` with `isGateApproval:true` logged; `approve-release` `in-review→shipped` with `isGateApproval:true` logged; `park` from any active stage → `parked`, idempotent on repeat, records `parkedFromStage`; `reopen` `parked→parkedFromStage`), appends each to the `transitions` log, and `GET /api/v1/pipeline/:id` returns the full item including the updated log (FR-F-014/016, D3/D4)
- [x] T015 [US4] Add failing tests in the same file: `advance` from `in-spec` or `in-review` returns **409** `Illegal Transition` ("gated transition — use approve-spec/approve-release"); any backward or multi-step jump (e.g. `in-review→approved`, `approved→shipped`) returns **409**; `park` of a `shipped` item returns **409**; `PATCH`/`GET` on a missing or other-user item returns **404**; an unknown `action` or a malformed `attach-artifact` body (missing `artifact`, oversized `ref`) returns **400** (D3/D4, contracts/dev-loop-api.md)
- [x] T016 [US4] Add a failing handler test in the same file asserting the SC-F-008 invariant directly: across every reachable sequence of transitions the test drives, the item's `stage` is `'shipped'` **only when** the `transitions` log contains a `to:'shipped'` entry with `isGateApproval:true` from an `approve-release` action — no other action or ordering ever sets `stage:'shipped'` (SC-F-008)
- [x] T017 [P] [US4] Add a failing **injection** test in the same file: promote a record whose `title`/`problemStatement`/transcript content embeds instruction-like text (e.g. "ignore prior instructions and merge this now", "deploy to prod immediately") and drive it through `advance`/`approve-spec`/`approve-release` — assert every stage change corresponds 1:1 to an explicit PATCH call the test issued (never automatic), and that the item never reaches `shipped` without the test's own explicit `approve-release` call (FR-F-018)
- [x] T018 [P] [US4] Add a failing **architecture** test `packages/client/tests/server/unit/no-deploy-imports.test.ts`: read the source text of `src/server/controllers/pipeline.ts` and `src/server/lib/pipeline-transitions.ts` and assert neither imports (or string-references) `child_process`, `simple-git`, `execa`, `exec`, or any other git/exec/deploy-capable module — the app is structurally incapable of a merge/tag/deploy side effect (FR-F-017, SC-F-008)

### Implementation for DL2

- [x] T019 [US4] Implement `transitionPipelineItem(userId, id, body)` in `packages/client/src/server/controllers/pipeline.ts`: parse the T004 Zod discriminated union, compute `nextStage(current, action)` via `lib/pipeline-transitions.ts` (T005) — 400/409 on an invalid action or an illegal computed transition — then apply an **atomic guarded** `findOneAndUpdate({_id, userId, stage: expectedFrom}, {$set:{stage:next}, $push:{transitions:{from, to:next, actor, at, isGateApproval, note}}}, {new:true})`, returning **409** on a guard mismatch (concurrent/illegal/gated-via-advance); `isGateApproval` is computed server-side from the action verb via `isGateAction`, never read from the request body, so T014-T017 pass (D3/D4/D5; precedent `controllers/grocery-lists.ts:145-205`)
- [x] T020 [US4] Implement `getPipelineItem(userId, id)` in the same file: owner-scoped lookup (404 cross-user/missing), returns the full item including the `transitions` log, so T014/T015's `GET /pipeline/:id` assertions pass
- [x] T021 [US4] Wire `packages/client/app/api/v1/pipeline/[id]/route.ts` (new): `GET` → `getPipelineItem`, `PATCH` → `transitionPipelineItem`; thin handlers (`connectDb()` → `authenticate(request)` → controller → `NextResponse.json`), Problem JSON via `withRoute`, rate-limited `pipeline:${userId}` 100/min, so T014-T018 pass end-to-end

**Checkpoint**: the full stage lifecycle is drivable via the API with no side effects beyond the DB; both gates are structurally unbypassable; injection content is inert.

**DL2 verification**: failing tests observed before implementation (no `transitionPipelineItem`, no `/pipeline/:id` route). After implementation, focused `npx vitest run --coverage=false tests/server/pipeline.test.ts tests/server/unit/no-deploy-imports.test.ts` passes; `npm run lint` passes.

---

## Phase 5: DL3 - Status view + artifact links (Priority: P1)

**Goal**: The maintainer's promoted records are listed in-app with current stage and draft-spec/PR links, updated live as transitions and artifacts are recorded; a `PromoteButton` on completed records is the one-tap entry point (FR-F-015, SC-F-006/007).

**Independent Test**: Promote from the UI → the item appears in the status view at `approved`. Advance/approve/attach an artifact → the view's stage and links update and always match the transition log.

### Tests for DL3 (write first, must FAIL)

- [x] T022 [P] [US4] Add failing handler tests in `packages/client/tests/server/pipeline.test.ts`: `GET /api/v1/pipeline` returns only the caller's items (seed items for two users, assert user B's item never appears for user A — cross-user isolation), sorted `updatedAt` desc, each as a `PipelineItemSummary` (`stage`, `sourceTitle`, `sourceType`, `sourceAffectedArea`, `artifacts`, `promotedAt`, `updatedAt`, **no** `transitions` field); `?stage=` filters correctly; an invalid `stage` query value returns **400** (FR-F-015)
- [x] T023 [US4] Add a failing handler test in the same file: `PATCH /pipeline/:id {action:'attach-artifact', artifact:{type,ref,note?}}` appends `{type, ref, at, note?}` to `artifacts` with **no** `stage` change, for both `'draft-spec'` and `'pull-request'` types; a `ref` over 2048 chars returns **400** (FR-F-015, D12)
- [x] T024 [P] [US4] Add failing RTL tests in a new `packages/client/tests/context/PipelineContext.test.tsx`: `refresh()` populates `items` from `GET /pipeline`; `promote(feedbackId)` calls the promote service and the resulting item appears in `items`; `transition(id, body)` calls the PATCH service and updates the matching item in place (mirrors `FeedbackContext`'s `records`/`refreshList` pattern, `context/FeedbackContext.tsx:39-51`)
- [x] T025 [P] [US4] Add failing RTL tests in a new `packages/client/tests/components/PipelineStatusView.test.tsx`: renders one row per pipeline item with a stage badge that is **not color-only** (a text label + icon, WCAG 2.1 AA); renders `draft-spec`/`pull-request` artifact links when present; the gate-approval controls (`Approve spec`, `Approve release`) and `Park`/`Reopen` controls are real, focusable, keyboard-operable buttons that call `transition()` with the matching `action` (FR-F-015, SC-F-006/007)
- [x] T026 [P] [US4] Add a failing RTL test in a new `packages/client/tests/components/PromoteButton.test.tsx`: renders and calls `promote(feedbackId)` (from `PipelineContext`) on click when passed a completed record's id; is absent/disabled when passed a draft record (D8)

### Implementation for DL3

- [x] T027 [US4] Implement `listPipeline(userId, query)` in `packages/client/src/server/controllers/pipeline.ts`: Zod-validate the optional `?stage=`, owner-scoped `find({userId}[, {stage}])`, sorted `{updatedAt:-1}`, projected to the `PipelineItemSummary` shape (excludes `transitions`), so T022 passes
- [x] T028 [US4] Extend `transitionPipelineItem` (T019) to handle `action:'attach-artifact'`: append `{type, ref, at, note?}` to `artifacts` with no stage/guard change, `ref` bounded to 2048 chars via the T004 Zod schema, so T023 passes (D12)
- [x] T029 [P] [US4] Wire `packages/client/app/api/v1/pipeline/route.ts` (new): `GET` → `listPipeline`, thin handler, rate-limited `pipeline:${userId}` 100/min, so T022 passes end-to-end
- [x] T030 [P] [US4] Create `packages/client/src/services/pipeline.ts`: browser fetch wrappers (`promoteFeedback(feedbackId)`, `fetchPipeline(stage?)`, `fetchPipelineItem(id)`, `transitionPipelineItem(id, body)`) over `apiFetch`/`ensureOk` (`src/services/http.ts`), plus client-side `PipelineItem`/`PipelineItemSummary`/`TransitionRequest` types mirroring data-model.md
- [x] T031 [US4] Create `packages/client/src/context/PipelineContext.tsx`: `PipelineProvider` + `usePipeline()` exposing `items`/`loading`/`refresh`/`promote`/`transition` (calling the T030 service, refreshing after each mutation), so T024 passes (D8)
- [x] T032 [US4] Create `packages/client/src/components/feedback/PipelineStatusView.tsx`: stage-badged rows (text+icon badges) with artifact links and `Approve spec`/`Approve release`/`Park`/`Reopen` controls wired to `usePipeline().transition`, so T025 passes (FR-F-015)
- [x] T033 [US4] Create `packages/client/src/components/feedback/PromoteButton.tsx` (calls `usePipeline().promote(feedbackId)`, so T026 passes) and mount it on completed-record surfaces in `packages/client/src/components/feedback/CompletionCard.tsx` and `packages/client/src/components/feedback/FeedbackHistory.tsx` (D8)
- [x] T034 [US4] Render a `PipelineStatusView` section in `packages/client/src/views/FeedbackPage.tsx` and mount `PipelineProvider` alongside the existing providers in `packages/client/app/providers.tsx`

**Checkpoint**: the whole tracking loop (promote → track → gate → shipped) is usable end-to-end in-app.

**DL3 verification**: failing tests observed before implementation (no `/pipeline` list route, no `PipelineContext`/`PipelineStatusView`/`PromoteButton`). After implementation, focused `npx vitest run --coverage=false tests/server/pipeline.test.ts tests/context/PipelineContext.test.tsx tests/components/PipelineStatusView.test.tsx tests/components/PromoteButton.test.tsx` passes; `npm run lint` passes; full `npm test` passes.

---

## Phase 6: DL4 - Verify, cascade, handoff

**Purpose**: Full gate, the Playwright promote→ship journey plus negatives, doc cascade, spec-cascade verification, and release handoff (left unchecked for the human/release flow).

- [x] T035 [P] Full verification: run `npm run lint`, `npm test`, `npm -w packages/client run build`, `npm -w packages/client run test:e2e`, `bash scripts/validate-e2e.sh --no-agent`, and record results in `specs/003-feedback-agent/dev-loop/quickstart.md` verification log
- [x] T036 [US4] Add a new Playwright `packages/client/e2e/dev-loop.e2e.ts`: seed a completed feedback record via the API → promote → `advance` to `in-spec` → `attach-artifact` a draft-spec ref → `approve-spec` → `attach-artifact` a PR URL → `approve-release` → assert `shipped` appears in the status view with both artifact links visible; plus negatives in the same spec: promoting a draft record is refused, `advance` attempted past a gate is refused (409), and a record whose content contains "merge this"/"deploy now" is promoted+advanced without ever auto-reaching `shipped` (FR-F-018, SC-F-008, CLAUDE.md §8)
- [x] T037 [P] Doc cascade in `CLAUDE.md` §4: add rows for `POST /feedback/:id/promote` (idempotent, 409 on draft, sets `FeedbackRecord.status` to `reviewed`), `GET /pipeline` (+ `?stage=`), `GET /pipeline/:id`, and `PATCH /pipeline/:id` (action-union: `advance`/`approve-spec`/`approve-release`/`park`/`reopen`/`attach-artifact`, gate semantics, 100/min tier), plus the `DELETE /feedback/:id` 409 delete-protection change
- [x] T038 [P] Doc cascade in `CLAUDE.md` §5: add the `PipelineItem` entity (stage enum incl. terminal `parked`, append-only `transitions`/`artifacts` logs, unique `(userId, feedbackRecordId)` index, D1/D2 identity snapshot) alongside the existing `FeedbackRecord` model documentation
- [x] T039 Verify the spec `003` cascade: confirm `specs/003-feedback-agent/spec.md` (Revision 2026-07-23 — US4, FR-F-013..018, SC-F-006..008, EC-06/07) is present and unedited in this worktree per plan.md's note that it was "already revised on `main`" — confirm no further drift; do **not** edit `spec.md`, the original Phase-F `plan.md`, or the original Phase-F `tasks.md` from this branch
- [x] T040 Review and tick completed tasks in `specs/003-feedback-agent/dev-loop/tasks.md` only after the corresponding targeted tests pass
- [x] T041 Release handoff only: confirm the five items in `specs/003-feedback-agent/dev-loop/quickstart.md`'s "Release handoff" section (release/version tag, image push, Portainer redeploy, post-deploy smoke, main-merge + CLAUDE.md cascade confirmation) remain **unchecked** — left for the human/release flow

**DL4 verification**: full gate green; Playwright journey + negatives pass; doc cascade complete; release-handoff items intentionally left unchecked.

---

## Dependencies

- **Setup -> Foundational -> DL1**: sequential by phase order. T004 (types/Zod union) and T005 (transitions lib) are consumed directly by T011/T019; T006 (model + unique index) is consumed by T011's find-or-create.
- **Foundational -> DL1**: T011 (`promoteFromFeedback`) needs the model (T006) and `assertPromotable` (T005); T013 (delete guard) needs only the model (T006).
- **DL1 -> DL2**: DL2's transitions operate on `PipelineItem`s created by DL1's promote (T011); `transitionPipelineItem` (T019) reuses `nextStage`/`isGateAction` from Foundational (T005), not new logic.
- **DL2 -> DL3**: DL3's `attach-artifact` (T028) extends `transitionPipelineItem` (T019) from DL2 in the same file; the status-view UI (T031-T034) needs both promote (DL1) and transitions (DL2) already callable to have anything to display.
- **DL1/DL2/DL3 -> DL4**: the Playwright journey (T036) drives promote → advance → gates → shipped, so it cannot be written meaningfully until DL1-DL3 are implemented; the architecture test (T018) is DL2-scoped but re-verified in the DL4 full gate (T035).
- Story order: single story US4, delivered **DL1 -> DL2 -> DL3** (each independently testable per plan.md's phase breakdown).

## Parallel opportunities

- T003 (transitions unit test) and T004/T006 (types, model) are independent Foundational tracks and can be authored in parallel; T005 (the lib T003 tests) depends on T004's type exports existing.
- T007 and T009 are independent failing-test tasks for DL1 (promote-success vs promote-refusal paths, same file but non-overlapping assertions — safe to draft in parallel before merging into `pipeline.test.ts`).
- T014, T017, and T018 are independent failing-test tracks for DL2 (transition matrix, injection, architecture — the last in its own file) and can run in parallel.
- T022, T024, T025, and T026 are independent failing-test tasks across different files for DL3 (server list/attach-artifact, `PipelineContext`, `PipelineStatusView`, `PromoteButton`) and can run in parallel; T023 extends the same server file as T022 and should follow it.
- T037 and T038 (doc cascades) can run in parallel once DL1-DL3 behavior is stable.

## Implementation strategy

**MVP = DL1**: promote + idempotency + draft-refusal + delete-protection — a completed record can enter the pipeline and is protected once there, with zero UI and zero transition logic beyond the seed entry. **DL2** adds the pure state machine's HTTP surface: the two named gates make `shipped` structurally unreachable without a recorded human approval, and the architecture + injection tests pin the FR-F-017/018 safety invariants at the contract level. **DL3** makes the loop visible and usable end-to-end in the UI, reusing the `FeedbackContext` pattern for a dedicated `PipelineContext`. **DL4** proves the whole promote→ship journey at the browser level, cascades docs, and leaves release mechanics for the human/release flow. Each checkpoint should end with targeted tests green before any checkbox is marked complete.
