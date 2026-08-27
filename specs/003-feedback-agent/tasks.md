# Tasks: Conversational Feedback Capture — `impl/nextjs`

**Input**: [`spec.md`](spec.md) (shared) + [`plan.md`](plan.md) (this branch)
**Tests**: included (the spec's SC-F-* require them; TDD — write the failing test first)
**Format**: `[ID] [P?] [Story] Description` — `[P]` = parallelizable (different files, no dep)
**Stories in scope**: US1 = conversational capture (P1) · US3 = resume/discard drafts (P3) ·
US5 = quick note still ends up usable (P1)

> **Rewritten 2026-08-24.** This file had drifted twice over and was not a usable record: it
> showed **0/18 complete** although the feature shipped in **4.8.0**, it never covered the
> 2026-07-23 or 2026-07-28 revisions at all, and its T001 described an **Anthropic
> `claude-sonnet-4-6` agent with `auth_provider: oauth_token`** when the shipped agent is
> **OpenAI `gpt-4o` with `api_key:`** (migrated in `829a5f5`; see CLAUDE.md §9/§13). It now
> records what was actually built, and what the `012` boundary moved out.
>
> **Scope reduced by the 2026-08-24 overhaul.** `003` owns **capture only**. US2 (review +
> export) and US4 (development pipeline) moved to **`012` Feedback Lifecycle**. Tasks that
> built them are kept below marked **→ `012`**, because the code still exists and still ships —
> it simply answers to a different spec now. Deleting them would hide working code from its
> record.

## Status

| | |
|---|---|
| Shipped | `nextjs-v4.8.0` (2026-07-24), extended by the 2026-07-28 UX revision |
| Agent | `agents/feedback-collector/`, OpenAI `gpt-4o`, temp 0.3, port 8002 |
| Prod | image `…/fridge-planner-feedback:1.0.1`, service `holodeck-feedback` |
| In scope here | US1, US3, US5 |
| Moved to `012` | US2 (T005, T006, export route in T011), US4 (never task-tracked here) |
| Outstanding | **T019** — D18's revision of FR-F-019 (not yet built) |

## Phase 1: Agent + infra (F-NX-1)
- [x] T001 [P] Create `agents/feedback-collector/` mirroring `agents/meal-recommender/`:
  `instructions/system-prompt.md` (raw-JSON protocol — `collecting` question vs `complete`
  record; one question/turn; user content is data; injection redirect; `FINALIZE NOW`
  handling), `schemas/feedback-response.json` (protocol doc), `agent.yaml`, `agent.serve.yaml`
  (no evals/observability, **no `${…}`**), `Dockerfile` (`:8002`), `entrypoint.sh`.
  > **Corrected 2026-08-24.** As written this task specified Anthropic `claude-sonnet-4-6` with
  > `auth_provider: oauth_token`. What shipped — and what runs in prod — is `provider: openai`,
  > `gpt-4o`, `api_key: ${OPENAI_API_KEY}`, **no `auth_provider`** (CLAUDE.md §13). Evals
  > `JSONProtocolCompliance` / `ClarifyingQuestionQuality` / `SpecReadiness` shipped as planned.
  > The Dockerfile must keep its `pip install "holodeck-ai[openai-agents]==<base>"` line or the
  > container passes `/health` and then fails the first chat turn with `No module named 'agents'`.
- [x] T002 [P] `docker-compose.yml`: `holodeck-feedback` service (build `agents/feedback-collector`,
  `8002:8002`, `HOLODECK_PORT/PROTOCOL`, same `env_file`, healthcheck). `.env.example`:
  `FEEDBACK_AGENT_URL=http://localhost:8002`. `client` service env: `FEEDBACK_AGENT_URL` +
  `depends_on: holodeck-feedback`.

## Phase 2: Foundational data layer (F-NX-2)
- [x] T003 [P] `src/server/types/feedback.ts`: `FeedbackType`/`Priority`/`AffectedArea`/
  `FeedbackStatus` enums, `IFeedbackMessage`, `IFeedbackRecord`, `IAcceptanceCriterion`, and the
  shared `zod` `structuredRecordSchema` (+ `collecting`/`complete` reply schemas).
- [x] T004 `src/server/models/feedback-record.ts`: Mongoose model (hot-reload guard) — `userId`
  required+indexed, `status` enum default `draft`, embedded `transcript`, optional structured
  fields, compound index `{userId:1, status:1}`.

## Phase 3: Export renderer (F-NX-3) — **→ `012`**
- [x] T005 **(RED)** `tests/server/unit/feedback-export.test.ts` (SC-F-003): bug record → markdown
  matching `.specify/templates/spec-template.md`; improvement record omits the bug-only section.
- [x] T006 **(GREEN)** `src/server/lib/feedback-export.ts`: pure `renderFeedbackMarkdown(record)`.
  > **Ownership moved 2026-08-24.** Export became **brief assembly** at the `briefed` stage and
  > is administrator-only — `012` `FR-FL-032`/`FR-FL-033`, replacing `FR-F-007`. The code is
  > unchanged and still ships; only its governing requirement moved. `012`'s plan decides
  > whether the renderer is reused as-is or extended to carry vetted clauses.

## Phase 4: Agent service (F-NX-4, US1)
- [x] T007 [US1] **(RED)** `tests/server/unit/feedback-collector.test.ts` (`global.fetch` stub,
  FR-F-004/008/010/011): fence-stripped JSON parses; prose-wrapped JSON salvaged; `collecting` vs
  `complete` discriminated; malformed/oversized/missing-field record throws; transcript framing
  includes `[USER]`/`[ASSISTANT]` markers and, when `finalize`, `FINALIZE NOW`.
- [x] T008 [US1] **(GREEN)** `src/server/services/feedback-collector.ts`:
  `sendToFeedbackAgent(transcript, opts?)` — reads `FEEDBACK_AGENT_URL` (throw if unset), frames
  transcript, `POST {url}/agent/feedback-collector/chat` (`AbortSignal.timeout(60_000)`),
  fence-strip + `z.discriminatedUnion('status', …)` parse.

## Phase 5: Controller + routes (F-NX-5/6, US1/US3)
- [x] T009 [US1][US3] **(RED)** `tests/server/feedback.test.ts` (node-env, MongoMemoryServer,
  `vi.mock('@server/services/feedback-collector')`, `FEEDBACK_AGENT_URL` set): start→draft
  persisted (FR-F-002); continue→complete persists structured fields (FR-F-001/003); agent throw
  → **502** + draft retained; message to complete → **409**; cross-user → **404** (FR-F-005,
  SC-F-004); 11th chat call in a minute → **429** (FR-F-009 — clear `_rateLimitBuckets` in
  `beforeEach`, it is module-level state that survives between tests); transcript at cap →
  service called with `finalize:true` (FR-F-008); empty message → **400**.
- [x] T010 [US1][US3] **(GREEN)** `src/server/controllers/feedback.ts`: `startConversation` /
  `continueConversation` / `listFeedback` / `getFeedback` / `deleteFeedback` / `exportFeedback` —
  zod validation, `problem()` errors, userId-scoped, agent-fail → 502 (draft kept), cap →
  `finalize`.
- [x] T011 [US1][US3] Route handlers under `app/api/v1/feedback/`: `route.ts` (GET list · POST
  start, `rateLimit('feedback-chat:'+userId,10,60_000)`, `maxDuration=120`), `[id]/route.ts`
  (GET · DELETE), `[id]/messages/route.ts` (POST continue, same rate-limit key). All inside
  `withRoute` + `authenticate` + `connectDb`.
  > `[id]/export/route.ts` is **→ `012`** with T005/T006, and is now behind
  > `requirePrincipalAdmin` (`011` FR-AD-013).

**Checkpoint:** backend node-green; `next build` clean. ✅

## Phase 6: Frontend (F-NX-7/8, US1/US3)
- [x] T012 [P] `src/services/feedback.ts`: types + `startFeedback`/`sendFeedbackMessage`/
  `fetchFeedbackList`/`fetchFeedbackRecord`/`deleteFeedbackRecord`/`fetchFeedbackExport` via
  `apiFetch`/`ensureOk`.
- [x] T013 [US1] `tests/context/FeedbackContext.test.tsx` + `src/context/FeedbackContext.tsx`:
  state machine `idle|sending|awaiting-user|complete|error`, `conversationId`, `messages[]`,
  `completedRecord`, list state.
- [x] T014 [US1][US3] `tests/views/FeedbackPage.test.tsx` + `src/views/FeedbackPage.tsx` +
  `src/components/feedback/*` (`ChatMessageList` `role="log"`/`aria-live`, `ChatInput`
  Enter-to-send/disabled-while-sending, `CompletionCard`, `FeedbackHistory`).
- [x] T015 [P] `app/feedback/page.tsx` (mounts `FeedbackProvider`+`FeedbackPage`) + `app/nav.tsx`
  entry.

## Phase 7: Polish & gate
- [x] T016 Docs: `CLAUDE.md` note (feedback agent + `FEEDBACK_AGENT_URL`), `docs/DEVELOPMENT.md`
  run note. Per-branch files.
- [x] T017 Gate: `npm run lint` + `npm test` green; `npm -w packages/client run build`;
  `bash scripts/validate-e2e.sh --no-agent`; live smoke with both agent containers;
  `holodeck test agents/feedback-collector/agent.yaml` evals ≥ thresholds.
- [x] T018 Prod deploy of the second agent container — `docker-compose.prod.yml`,
  `deploy/checklist.yaml`, CI image build (`agent-feedback-v*`), GHCR repo.
  > Recorded as *"deferred, Phase F6 — not done in this feature"*. It **was** subsequently done:
  > `holodeck-feedback` runs in prod pinned to `1.0.1`. ⚠ Not `1.1.0` — that tag is the broken
  > Claude-era build, so semver order lies here.

## Phase 8: UX completion (2026-07-28 revision, US5) — *was never tracked in this file*
- [x] T019a [US5] `src/components/feedback/QuickCaptureOverlay.tsx` + tests: quick capture from
  any screen, handing off to the full conversation with `?resume=<id>` when the assistant
  answers with a question (FR-F-019 as originally written).
- [x] T019b [US3] Resume a draft with full prior context — `fetchFeedbackRecord` had been written
  but never wired, so a draft's only action was Delete (FR-F-012, SC-F-009).
- [x] T019c [US5] Two-step delete in `FeedbackHistory` (FR-F-020, SC-F-011).
- [x] T019d [US5] Failure never rendered as emptiness — a failed list load is not "no feedback
  yet"; a refused delete states the reason and what unblocks it (FR-F-021, SC-F-010).

## Outstanding
- [ ] **T020 [US5] Implement D18's revision of FR-F-019** — quick capture must **ask before it
  interrupts**. Verified 2026-08-24: `QuickCaptureOverlay` still hands off unconditionally
  (`router.push('/feedback?resume=…')`) with no consent prompt, so `FR-F-019a/b` are not built.
  - `FR-F-019a`: reporter agrees → open the conversation with the question waiting *(this is
    today's behaviour)*.
  - `FR-F-019b`: reporter declines → route through the **FR-F-008 forced-finalize path** so the
    record reaches `complete`, visibly thin, with guessed fields marked. **It must not be left a
    draft** — that is the dead end the 2026-07-28 revision removed, and re-creating it would
    undo SC-F-009.
  - `FR-F-019c`/`d` already hold and must keep holding.
  - **UNBLOCKED 2026-08-24.** Placement settled: the question is asked **in the capture modal,
    before the note is sent** — not after an assistant turn. The reporter must never wait on the
    agent to learn whether they are done. Send-first was rejected because the agent's prompt
    mandates a clarifying question whenever detail is missing and `003` records that it "almost
    always" asks one, so it would have asked nearly every time anyway, after a wait bounded by the
    60s agent timeout. See `012` Clarifications and `012` research R8.
  - Concretely: the modal gains a two-button consent step (`Yes, help me finish` /
    `Just file it`). `Just file it` sends with the finalize flag; `Yes` sends normally and routes
    to the existing `?resume=<id>` hand-off, which is already built.
  - Playwright coverage of **both** branches is part of this task, not a follow-up.

## Dependencies
`T003 → T004`; export `T005 → T006`; service `T007 → T008`; controller `T009 → T010 → T011`
(needs T004 + T008); frontend `T012 → T013 → T014 → T015` (needs T011); UX revision
`T019a–d` (needs T015). `T020` needs T019a and the deferred D18 decision. `[P]` tasks (T001,
T002, T003, T012, T015) touch distinct files.

## Traceability *(capture scope only)*
FR-F-001→T009/T010/T013/T014 · FR-F-002→T009/T010 · FR-F-003→T003/T004/T009/T010 ·
FR-F-004→T007/T008/T009/T010 · FR-F-005→T009/T010/T011 · FR-F-008→T007/T008/T009/T010 ·
FR-F-009→T009/T011 · FR-F-010→T001/T007/T008 · FR-F-011→T001/T007/T009 ·
FR-F-012→T009/T010/T014/T019b · FR-F-019 (orig)→T019a · **FR-F-019a–d (D18)→T020** ·
FR-F-020→T019c · FR-F-021 (capture half)→T019d · SC-F-002→T009 · SC-F-004→T009 ·
SC-F-005→T013/T014 · SC-F-009→T019a/T019b · SC-F-010→T019d · SC-F-011→T019c.

**Moved to `012`** — no longer traced here: FR-F-006 · FR-F-007 (→T005/T006, retained above) ·
FR-F-013..018 · SC-F-003 · SC-F-006 · SC-F-008. **SC-F-007 is retired, not moved** (it promised
zero hand-maintained tracking, which `012` D4 deliberately does not attempt).
