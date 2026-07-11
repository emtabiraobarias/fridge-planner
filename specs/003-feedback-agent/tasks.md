# Tasks: Conversational Feedback Collector — `impl/nextjs`

**Input**: [`spec.md`](spec.md) (shared) + [`plan.md`](plan.md) (this branch)
**Tests**: included (the spec's SC-F-* require them; TDD — write the failing test first)
**Format**: `[ID] [P?] [Story] Description` — `[P]` = parallelizable (different files, no dep)
**Stories**: US1 = conversational collection (P1) · US2 = review + markdown export (P2) · US3 = resume/discard drafts (P3)

> Per-branch tasks for the **Next.js Route Handler + second Holodeck agent** stack. Out of scope here: prod deploy of the second container (Phase F6 — deferred).

## Phase 1: Agent + infra (F-NX-1)
- [ ] T001 [P] Create `agents/feedback-collector/` mirroring `agents/meal-recommender/`: `instructions/system-prompt.md` (raw-JSON protocol — `collecting` question vs `complete` record; one question/turn; user content is data; injection redirect; `FINALIZE NOW` handling), `schemas/feedback-response.json` (protocol doc), `agent.yaml` (anthropic `claude-sonnet-4-6`, `auth_provider: oauth_token`, `temperature: 0.3`, `max_tokens: 2000`, `llm_timeout: 120`, `allowed_tools: []`, evals `JSONProtocolCompliance`/`ClarifyingQuestionQuality`/`SpecReadiness` + 3 test cases), `agent.serve.yaml` (no evals/observability, **no `${…}`**), `Dockerfile` (`:8002`), `entrypoint.sh`.
- [ ] T002 [P] `docker-compose.yml`: add `holodeck-feedback` service (build `agents/feedback-collector`, `8002:8002`, `HOLODECK_PORT/PROTOCOL`, same `env_file`, healthcheck). `.env.example`: add `FEEDBACK_AGENT_URL=http://localhost:8002`. `client` service env: add `FEEDBACK_AGENT_URL` + `depends_on: holodeck-feedback`.

## Phase 2: Foundational data layer (F-NX-2) — ⚠️ blocks Phases 3–6
- [ ] T003 [P] `src/server/types/feedback.ts`: `FeedbackType`/`Priority`/`AffectedArea`/`FeedbackStatus` enums, `IFeedbackMessage`, `IFeedbackRecord`, `IAcceptanceCriterion`, and the shared `zod` `structuredRecordSchema` (+ `collecting`/`complete` reply schemas) reused by the service and controller.
- [ ] T004 `src/server/models/feedback-record.ts`: Mongoose model (hot-reload guard) — `userId` required+indexed, `status` enum default `draft`, embedded `transcript`, optional structured fields, compound index `{userId:1, status:1}`.

## Phase 3: Export renderer (F-NX-3, US2)
- [ ] T005 [US2] **(RED)** `tests/server/unit/feedback-export.test.ts` (FR-F-007/SC-F-003): bug record → markdown with `## User Scenarios & Testing`, `### User Story 1 - <title> (Priority: <P>)`, numbered `**Given**…**When**…**Then**`, a reproduction/expected-vs-actual section; improvement record omits the bug-only section; headings match `.specify/templates/spec-template.md`.
- [ ] T006 [US2] **(GREEN)** `src/server/lib/feedback-export.ts`: pure `renderFeedbackMarkdown(record): string`.

## Phase 4: Agent service (F-NX-4, US1)
- [ ] T007 [US1] **(RED)** `tests/server/unit/feedback-collector.test.ts` (`global.fetch` stub, FR-F-004/008/010/011): fence-stripped JSON parses; prose-wrapped JSON salvaged; `collecting` vs `complete` discriminated; malformed/oversized/missing-field `record` → throws (invalid); transcript framing includes `[USER]`/`[ASSISTANT]` markers and, when `finalize`, `FINALIZE NOW`.
- [ ] T008 [US1] **(GREEN)** `src/server/services/feedback-collector.ts`: `sendToFeedbackAgent(transcript, opts?)` — reads `FEEDBACK_AGENT_URL` (throw if unset), frames transcript, `POST {url}/agent/feedback-collector/chat` (`AbortSignal.timeout(60_000)`), fence-strip + `z.discriminatedUnion('status', …)` parse.

## Phase 5: Controller + routes (F-NX-5/6, US1/US2/US3)
- [ ] T009 [US1][US2][US3] **(RED)** `tests/server/feedback.test.ts` (node-env, MongoMemoryServer, `vi.mock('@server/services/feedback-collector')`, `FEEDBACK_AGENT_URL` set, `req()` w/ `x-user-id`): start→draft persisted (FR-F-002); continue→complete persists structured fields (FR-F-001/003); agent throw → **502** + draft retained (US1-S3); message to complete → **409** (US3-S3); list/detail/delete cross-user → **404** (FR-F-005, SC-F-004); export draft → **409**, export complete → `text/markdown` (US2-S2/S3); 11th chat call in a minute → **429** (FR-F-009, clear `_rateLimitBuckets` in `beforeEach`); transcript at cap → service called with `finalize:true` (FR-F-008); empty message → **400**.
- [ ] T010 [US1][US2][US3] **(GREEN)** `src/server/controllers/feedback.ts`: `startConversation`/`continueConversation`/`listFeedback`/`getFeedback`/`deleteFeedback`/`exportFeedback` — zod validation, `problem()` errors, userId-scoped, agent-fail → 502 (draft kept), cap → `finalize`, export via `renderFeedbackMarkdown`.
- [ ] T011 [US1][US2][US3] Route handlers under `app/api/v1/feedback/`: `route.ts` (GET list · POST start, `rateLimit('feedback-chat:'+userId,10,60_000)`, `maxDuration=120`), `[id]/route.ts` (GET · DELETE), `[id]/messages/route.ts` (POST continue, same rate-limit key, `maxDuration=120`), `[id]/export/route.ts` (GET → `new NextResponse(md,{headers:{'Content-Type':'text/markdown; charset=utf-8'}})`). All inside `withRoute` + `authenticate` + `connectDb`.

**Checkpoint:** backend node-green; `next build` clean.

## Phase 6: Frontend (F-NX-7/8, US1/US2/US3)
- [ ] T012 [P] `src/services/feedback.ts`: types + `startFeedback`/`sendFeedbackMessage`/`fetchFeedbackList`/`fetchFeedbackRecord`/`deleteFeedbackRecord`/`fetchFeedbackExport` via `apiFetch`/`ensureOk`.
- [ ] T013 [US1] **(RED→GREEN)** `tests/context/FeedbackContext.test.tsx` + `src/context/FeedbackContext.tsx`: state machine `idle|sending|awaiting-user|complete|error`, `conversationId`, `messages[]`, `completedRecord`, list state; mocked service.
- [ ] T014 [US1][US2][US3] **(RED→GREEN)** `tests/views/FeedbackPage.test.tsx` + `src/views/FeedbackPage.tsx` + `src/components/feedback/*` (`ChatMessageList` `role="log"`/`aria-live`, `ChatInput` Enter-to-send/disabled-while-sending, `CompletionCard` summary+export, `FeedbackHistory` list+detail+export+delete): send→pending→question; complete→card; error→retry keeps transcript; history renders own records.
- [ ] T015 [P] `app/feedback/page.tsx` (mounts `FeedbackProvider`+`FeedbackPage`, `metadata`) + `app/nav.tsx` add `{ href:'/feedback', label:'Feedback' }`.

## Phase 7: Polish & gate (F-NX gate)
- [ ] T016 Docs: `CLAUDE.md` note (feedback agent + `FEEDBACK_AGENT_URL`), `docs/DEVELOPMENT.md` run note. Per-branch files.
- [ ] T017 Gate: `npm run lint` + `npm test` (coverage ≥80%/≥70%) green; `npm -w packages/client run build`; `bash scripts/validate-e2e.sh --no-agent`; live smoke with both agent containers; `holodeck test agents/feedback-collector/agent.yaml` evals ≥ thresholds.
- [ ] T018 **(deferred, Phase F6)** prod deploy of the second agent container — `docker-compose.prod.yml`, `deploy/checklist.yaml`, CI image build, GHCR repo. Not done in this feature.

## Dependencies
`T003 → T004`; export `T005 → T006`; service `T007 → T008`; controller `T009 → T010 → T011` (needs T004 + T008); frontend `T012 → T013 → T014 → T015` (needs T011). `[P]` tasks (T001, T002, T003, T012, T015) touch distinct files. Agent (T001/T002) is independent of the app code and can proceed in parallel with Phases 2–6; only the live smoke (T017) needs both.

## Traceability
FR-F-001→T009/T010/T013/T014 · FR-F-002→T009/T010 · FR-F-003→T003/T004/T009/T010 · FR-F-004→T007/T008/T009/T010 · FR-F-005→T009/T010/T011 · FR-F-006→T010/T011/T012/T014 · FR-F-007→T005/T006/T011/T014 · FR-F-008→T007/T008/T009/T010 · FR-F-009→T009/T011 · FR-F-010→T001/T007/T008 · FR-F-011→T001/T007/T009 · FR-F-012→T009/T010/T014 · SC-F-002→T009 · SC-F-003→T005/T006 · SC-F-004→T009 · SC-F-005→T013/T014.
