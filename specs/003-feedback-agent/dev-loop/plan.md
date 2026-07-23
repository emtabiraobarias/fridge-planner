# Implementation Plan: Feedback→Feature Development Loop (tracking-layer MVP, `impl/nextjs`)

**Branch**: `003-devloop-implement` · **Date**: 2026-07-23 · **Spec**: [`../spec.md`](../spec.md)
**Input**: Revised feature specification `specs/003-feedback-agent/spec.md` (Revision 2026-07-23, backlog #7 — US4, FR-F-013..018, PipelineItem, SC-F-006..008, Assumptions 7–10)

> **Per-branch, revision-scoped plan** (not on `main`; does **not** replace the original Phase-F `plan.md`/`tasks.md`, which stay canonical for FR-F-001..012). This plans **only** the spec-`003` revision — the development-loop **tracking layer**: promote an approved feedback record into a pipeline, track its stages with a human gate at each critical boundary, and surface a status view. It **reuses** the shipped feedback model, controller, routes, export lib, and the standard handler stack unchanged; the speckit chain itself is Claude-orchestrated *on top of* the API (Assumptions 8/9), not run by the app.

## Summary

Deliver US4 in four independently testable increments plus polish. **DL1** adds the `PipelineItem` collection and idempotent **promote** (`POST /feedback/:id/promote`) with draft-refusal and delete-protection — the record moves out of the "just collected" pool into a tracked pipeline at stage *approved* (US4 scenarios 1, 5; EC promote-idempotent, delete-protected). **DL2** adds the **stage state machine** and human-gated transitions (`PATCH /pipeline/:id` — `advance`/`approve-spec`/`approve-release`/`park`/`reopen`) with an append-only transition log, enforcing the FR-F-016 gates and the FR-F-017 branch/PR-only invariant (US4 scenarios 2, 3, 4; SC-F-008). **DL3** adds the **status view** — `GET /pipeline` list + `attach-artifact` for draft-spec/PR links + a `PipelineStatusView` UI surface with a `PromoteButton` on completed records (FR-F-015; SC-F-006/007). **DL4** verifies end-to-end (a Playwright promote→advance→gate→shipped journey plus the injection/negative cases), runs the full gate, and cascades docs (`CLAUDE.md` §4/§5; the spec is already revised on `main`). **No new npm dependency, no new service, no state library, no change to the `FeedbackRecord` schema shape, and — load-bearing — no endpoint that merges, tags, or deploys.**

## Technical Context

**Language/Version**: TypeScript (strict) on Node 20 / React 18 / Next.js 15 App Router — one process on `:3000`.
**Primary Dependencies**: existing only — Mongoose 8, Zod, Tailwind, `lucide-react`. **No new npm dependencies** (no embeddings/vector store, no scheduler/queue, no state library — CLAUDE.md §14).
**Storage**: MongoDB via Mongoose — **one new collection** (`PipelineItem`); the `FeedbackRecord` schema shape is unchanged (promotion only sets its existing `status` to `reviewed`). Indexes: unique `(userId, feedbackRecordId)` for idempotent promote, `(userId, stage)` for the status view.
**Testing**: Vitest node-env harness (`tests/server/`, `mongodb-memory-server`) — `tests/server/pipeline.test.ts` (promote idempotency/draft-refusal/cross-user, each transition + gate + illegal-transition 409, delete-protection, injection), a pure-logic `tests/server/unit/pipeline-transitions.test.ts` (exhaustive from×action legality matrix + gate flags + park/reopen), plus an **architecture test** asserting the pipeline controller imports no git/exec/deploy module (SC-F-008/FR-F-017). RTL for `PipelineStatusView`/`PromoteButton`/`PipelineContext`. A **Playwright** `e2e/dev-loop.e2e.ts` for the promote→track→gate→shipped journey and the negative cases (CLAUDE.md §8 — a feature is not done without browser-level coverage).
**Target Platform**: existing web app (mobile-first, 320–1920px); single-maintainer LAN deployment (Assumption 7).
**Project Type**: web — single `packages/client` package (UI + Route Handlers + `src/server`).
**Performance Goals**: promote and the status view meet the standard sync response-time constraint (001 CR-008); no assistant-backed latency in this revision (transitions are pure DB writes).
**Constraints**: server modules start with `import 'server-only'`; extensionless `@server/*` imports; thin handlers over controllers; Problem JSON via `problem()`/`withRoute`; complexity ≤10 (the state machine is a pure table-driven lib to stay under it); Context + hooks only (a dedicated `PipelineContext`, no store); **no endpoint performs a git/merge/tag/deploy side effect** (FR-F-017); **no transition derived from record content** (FR-F-018).
**Scale/Scope**: single-household; a handful of promoted items; append-only logs of a few entries each.

## Constitution Check

*Gate evaluated against root `constitution.md` + `CLAUDE.md` §7/§8/§14. Re-check after Phase 1 design: PASS.*

- **Strict typing / no `any` / explicit return types** PASS — `PipelineStage`/`TransitionAction`/`ArtifactType` are `as const` unions; the PATCH body is a Zod discriminated union; controller returns typed `ControllerResult`.
- **TDD** PASS — every DL phase starts with failing tests citing FR-F numbers (promote idempotency FR-F-013, gate 409s FR-F-016, branch/PR-only FR-F-017, injection FR-F-018) before implementation; the transition legality matrix is red-first in the unit suite.
- **Coverage ≥70% client + >80% logic** PASS — the pure `pipeline-transitions.ts` is exhaustively unit-tested; the controller paths get handler tests; the status view + promote button + context get RTL; full suite + Playwright are the final gate.
- **Context + hooks only** PASS — a **dedicated `PipelineContext`** holds the status-view list + promote/transition actions (SRP: keeps `FeedbackContext` focused on chat/review). No Redux/Zustand (CLAUDE.md §14).
- **Mobile-first, WCAG 2.1 AA** PASS — stage badges are not color-only (text label + icon); the Promote and gate-approval controls are real, focusable, keyboard-operable buttons with confirmation.
- **API-first, RFC 7807, versioned paths, rate limiting** PASS — new endpoints live under `/api/v1`, return Problem JSON via `withRoute`, and are rate-limited (default 100/min tier, FR-F-009); 404 is used uniformly for cross-user access (FR-F-005).
- **Reuse over rebuild** PASS — reuses `renderFeedbackMarkdown` (draft-spec seed), the completed-record schema guarantee (promotability), the grocery-lists guarded-transition pattern, the spec-006 PATCH-action-union idiom, and the whole `authenticate`/`connectDb`/`withRoute`/`problem`/`rateLimit`/`apiFetch` stack.
- **No embeddings / no new service / no state library / no in-app agent runtime** PASS (CLAUDE.md §14, Assumptions 8/9) — the app is state + audit + gate enforcement; the speckit chain runs in a Claude-orchestrated session over the API; no scheduler, job runner, or background agent is added.
- **No git/merge/tag/deploy side effect** PASS (FR-F-017) — `attach-artifact` stores a link string; `approve-release` flips a status field; an architecture test asserts the controller imports no `child_process`/git/deploy client.
- **Branch discipline** PASS — the spec was revised on `main` (already merged; verified present in this worktree); planning/tasks are per-branch `impl/nextjs` artifacts under `dev-loop/`. `impl/vite` remains deferred (Assumption 9).

## Project Structure

### Documentation (this revision)

```text
specs/003-feedback-agent/
├── spec.md                         # REVISED on main — canonical (US4, FR-F-013..018) — do NOT edit here
├── plan.md                         # original Phase-F plan — UNTOUCHED
├── tasks.md                        # original Phase-F tasks — UNTOUCHED
└── dev-loop/                       # THIS revision's artifacts
    ├── plan.md                     # this file
    ├── research.md                 # D1..D12
    ├── data-model.md               # PipelineItem schema, enums, indexes, back-compat
    ├── contracts/
    │   └── dev-loop-api.md         # promote / pipeline list+detail / PATCH transition / delete-guard
    ├── quickstart.md               # dev/test walkthrough + release handoff (unchecked)
    └── tasks.md                    # authored in a later /speckit.tasks step, NOT here
```

### Source Code (repository root — real paths)

```text
packages/client/
├── app/api/v1/
│   ├── feedback/
│   │   ├── [id]/
│   │   │   ├── route.ts                 # DELETE — add pipeline delete-protection guard (DL1)
│   │   │   └── promote/route.ts         # NEW — POST promote (DL1)
│   │   └── …                            # chat/list/detail/export routes UNCHANGED
│   └── pipeline/
│       ├── route.ts                     # NEW — GET list (status view) (DL3)
│       └── [id]/route.ts                # NEW — GET detail + PATCH transition (DL2/DL3)
├── src/
│   ├── server/
│   │   ├── models/
│   │   │   └── pipeline-item.ts         # NEW — PipelineItem schema + indexes (DL1)
│   │   ├── types/
│   │   │   └── pipeline.ts              # NEW — stage/action/artifact enums + Zod PATCH union (DL1)
│   │   ├── lib/
│   │   │   └── pipeline-transitions.ts  # NEW — pure state machine: nextStage/isGateAction/assertPromotable (DL2)
│   │   ├── controllers/
│   │   │   ├── pipeline.ts              # NEW — promoteFromFeedback / listPipeline / getPipelineItem / transitionPipelineItem (DL1-3)
│   │   │   └── feedback.ts              # CHANGED — deleteFeedback gains the active-pipeline guard (DL1)
│   │   └── lib/feedback-export.ts       # REUSED unchanged — the draft-spec seed (D11)
│   ├── services/
│   │   └── pipeline.ts                  # NEW — browser fetch wrappers + client types (DL1/DL3)
│   ├── context/
│   │   └── PipelineContext.tsx          # NEW — status list + promote/transition actions (DL3)
│   ├── components/feedback/
│   │   ├── PipelineStatusView.tsx       # NEW — stage-badged list + artifact links + gate controls (DL3)
│   │   ├── PromoteButton.tsx            # NEW — on completed records (DL3)
│   │   ├── CompletionCard.tsx           # CHANGED — mount PromoteButton (DL3)
│   │   └── FeedbackHistory.tsx          # CHANGED — promote affordance on completed rows (DL3)
│   ├── views/FeedbackPage.tsx           # CHANGED — render PipelineStatusView section (DL3)
│   └── app/providers.tsx                # CHANGED — mount PipelineProvider (DL3)
└── tests/
    ├── server/pipeline.test.ts          # NEW — promote/transitions/gates/delete-guard/injection (DL1-2)
    ├── server/unit/pipeline-transitions.test.ts  # NEW — exhaustive legality matrix (DL2)
    ├── server/unit/no-deploy-imports.test.ts     # NEW — architecture test, FR-F-017/SC-F-008 (DL2)
    ├── components/PipelineStatusView.test.tsx    # NEW — RTL (DL3)
    ├── context/PipelineContext.test.tsx          # NEW — RTL (DL3)
    └── ../e2e/dev-loop.e2e.ts                     # NEW — Playwright journey + negatives (DL4)
```

**Structure Decision**: Everything lands in the existing single `packages/client` app. The pipeline is a **separate collection + resource** (research D1) referencing the FeedbackRecord — promote is an action on the record (feedback route tree), transitions/list are on a small `/pipeline` resource. The state machine is a **pure lib** (D5) so its legality matrix is unit-tested without HTTP/Mongo and the controller stays under the complexity limit. No new context beyond a focused `PipelineContext`; no `FeedbackRecord` schema change.

## Phase breakdown (each phase ends runnable + tests green; phases = US4 slices + polish)

1. **DL1 — Promote into the pipeline (US4 scenarios 1 & 5; EC promote-idempotent, delete-protected).** Add `src/server/types/pipeline.ts` (enums + shapes), `models/pipeline-item.ts` (schema + unique `(userId, feedbackRecordId)` + `(userId, stage)` indexes, hot-reload-guarded), and `controllers/pipeline.ts#promoteFromFeedback(userId, feedbackId)`: look up `{ _id, userId }` (404 cross-user, FR-F-005), refuse non-`complete` records (409, FR-F-013), find-or-create the item at `stage: 'approved'` with the seed transition and identity snapshot (D2), set the record `status: 'reviewed'` (D6). Wire `POST /feedback/:id/promote` (thin handler, `promote:${userId}` 100/min). Add the delete-protection guard to `deleteFeedback` (409 on active pipeline; cascade a parked item, D9). **Independent test**: promote a completed record → 201 at `approved`; re-promote → 200 same item (idempotent, unique index); promote a draft → 409; promote another user's record → 404; delete a record with an active item → 409, with a parked item → 204 + cascade. **Runnable**: promote works end-to-end via the API; nothing merges/ships.
2. **DL2 — Stage machine + human gates (US4 scenarios 2, 3, 4; FR-F-014/016/017; SC-F-008).** Add the pure `lib/pipeline-transitions.ts` (`nextStage(current, action)`, `isGateAction`, `STAGE_ORDINAL`, park/reopen resolution) and `controllers/pipeline.ts#transitionPipelineItem(userId, id, body)` using an **atomic guarded** `findOneAndUpdate({ _id, userId, stage: expectedFrom }, …)` — 409 on guard mismatch (illegal/gated-via-advance/backward/jump/park-of-shipped). Append each transition to the log with `isGateApproval` set from the action verb (never client-forgeable, D3). Wire `PATCH /pipeline/:id` (Zod discriminated union) + `GET /pipeline/:id` (detail incl. log). **Independent test (unit)**: exhaustive from×action matrix — `advance` only `approved→in-spec`; `approve-spec` only `in-spec→in-review` (gate); `approve-release` only `in-review→shipped` (gate); `advance` from `in-spec`/`in-review` → error; backward/jump → error; `park`→`parked` idempotent; `reopen`→`parkedFromStage`. **Independent test (handler)**: cannot reach `shipped` without a recorded `approve-release` (SC-F-008); the **injection** case — a record whose fields embed "merge this/deploy now" is promoted+advanced and never auto-transitions or reaches `shipped` (FR-F-018). **Architecture test**: `controllers/pipeline.ts` imports no `child_process`/git/exec/deploy client (FR-F-017). **Runnable**: full stage lifecycle drivable via the API; no side effects beyond the DB.
3. **DL3 — Status view + artifact links (FR-F-015; SC-F-006/007).** Add `GET /pipeline` (owner-scoped list, optional `?stage=`), the `attach-artifact` action on `PATCH /pipeline/:id` (append `{type, ref, at}`, no stage change), the browser service `services/pipeline.ts`, the `PipelineContext` (list + `promote`/`transition`/`refresh`), the `PipelineStatusView` (stage-badged rows with draft-spec/PR links and gate-approval controls), a `PromoteButton` on `CompletionCard`/`FeedbackHistory`, the `FeedbackPage` section, and `PipelineProvider` in `app/providers.tsx`. **Independent test**: promote from the UI → the item appears at `approved` in the status view (SC-F-006); advancing/attaching links updates the view and its stage always matches the transition log (SC-F-007); RTL asserts the gate controls call the correct action and the badges are not color-only. **Runnable**: the whole tracking loop is usable in-app.
4. **DL4 — Verify + cascade + handoff.** Full lint/test/build gates. **Playwright** `e2e/dev-loop.e2e.ts`: seed a completed record via the API → promote → advance to `in-spec` → attach a draft-spec ref → `approve-spec` → attach a PR URL → `approve-release` → assert `shipped` in the status view; plus negatives (promote a draft → refused; `advance` past a gate → refused; an injection-content record never auto-ships). Doc cascade: `CLAUDE.md` §4 (new promote/pipeline endpoints) + §5 (PipelineItem entity) — the spec is already revised on `main`. Record the green run in `quickstart.md`; leave release/tag/Portainer handoff items unchecked for the Claude/human release flow.

## Complexity Tracking

*No constitution violations to justify.* Key judgments: **(a)** the pipeline is a **separate collection** (D1) rather than embedded fields — the small cost of a second collection buys DB-enforced idempotency, clean delete-protection, a single-collection status-view query, and zero migration for pre-revision records; **(b)** the state machine is a **pure table-driven lib** (D5) so the controller stays ≤10 cyclomatic complexity and the legality matrix (the correctness hotspot, SC-F-008) is exhaustively unit-tested without HTTP/Mongo; **(c)** **named gate actions** (`approve-spec`/`approve-release`) rather than a generic `advance(toStage)` make `isGateApproval` endpoint-set and non-forgeable, and make `shipped` structurally unreachable without a recorded gate approval; **(d)** the FR-F-017/018 safety invariants are enforced by **construction** (no git/exec/deploy capability in the app; no content-derived transitions) and pinned by an architecture test, not by content scanning; **(e)** the draft-spec handoff **reuses `feedback-export.ts`** and stores only a reference — the app never authors or commits a spec file (Assumption 9).

## Risks & mitigations

- **"Who advances" ambiguity (human vs Claude session, both authenticated as the maintainer)** → single-maintainer model (Assumption 7): the app records `actor` as an audit label only, and cannot/needn't separate the human from their own automation. The load-bearing guarantees are structural (D6/D7/D10): the app never ships anything, and no transition is content-derived. The tasks phase must keep gate actions as distinct verbs so `isGateApproval` stays endpoint-set.
- **Someone reads FR-F-016 as "gate every stage"** → only the two boundaries past `in-spec` and into `shipped` are gated; the intermediate speckit stages advance without a gate (they run within `in-review`). `advance` is deliberately valid only `approved→in-spec`; the two gates are the sole paths onward — a test locks this so a future edit can't silently ungate a boundary.
- **Delete-protection reading is ambiguous in the spec (EC-06)** → D9 combines the safe halves: block deletion while an **active** item exists (never destroy in-flight work), cascade a **parked** item (never dangle). A test covers both branches so the choice is explicit.
- **`shipped` misread as "the app deployed it"** → `shipped` is a status assertion backed by a recorded `approve-release`; the app performs no merge/tag/deploy (FR-F-017). The architecture test + the SC-F-008 handler test make this falsifiable, and `quickstart.md`/`CLAUDE.md` state it in prose.
- **Idempotent promote racing two concurrent requests** → the unique `(userId, feedbackRecordId)` index makes the second insert fail; the controller catches the duplicate-key error and returns the existing item (200), so idempotency holds under concurrency without a transaction (mirrors the grocery guarded-update posture).
- **Scope creep toward automation** → the MVP is the tracking layer only (Assumption 9). No scheduler, no in-app agent, no auto branch/PR/CI/deploy. "Out of scope" is restated below so the tasks phase does not drift.

## Out of scope

An in-app agent runtime / job runner / scheduler / background worker; app-driven branch, commit, PR, CI, or deploy actions (all human/session outside the app, FR-F-017); a maintainer-facing editor for the generated spec (spec is authored via the normal spec-first workflow on `main`, Assumption 9); multi-maintainer roles/permissions (single-maintainer, Assumption 7); auto-advancing more of the speckit chain (a later increment, Assumption 8); the `impl/vite` implementation (deferred by decision); release tags and Portainer deployment (Claude/human release flow).
