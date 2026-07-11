# Implementation Plan: Conversational Feedback Collector — `impl/nextjs`

**Branch**: `impl/nextjs` | **Date**: 2026-07-11 | **Spec**: [`spec.md`](spec.md) (shared, on `main`)
**Input**: Feature specification from `specs/003-feedback-agent/spec.md`

> **Per-branch plan.** The spec is the shared, topology-agnostic contract; this plan pins it to the **Next.js Route Handler + second Holodeck agent** stack. `impl/vite` will get its own `plan.md` if/when its implementation is undeferred (currently deferred by decision — see `ROADMAP_PROGRESS.md` Phase F).

## Summary

Add a conversational feedback agent. A new **Holodeck agent** (`feedback-collector`, its own container on `:8002`) drives a strict raw-JSON chat protocol: each turn returns either a clarifying question (`collecting`) or a finished, schema-shaped record (`complete`). The Next server layer persists every conversation as a `FeedbackRecord` from the first message (draft), replays the whole transcript to the agent each turn (**stateless** — CR-018), validates the agent's `complete` output with zod before marking the record complete, and exposes CRUD + a **spec-template markdown export**. A `/feedback` page provides the chat UI (US1) and an own-records review/export list (US2/US3). Mirrors the existing meal-recommender wiring end to end.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Next.js 15 App Router, Node 20, React 18
**Primary Dependencies**: `mongoose`, `zod` (both already present). New Holodeck agent image built from `agents/feedback-collector/` (Claude Sonnet 4.6, `holodeck-base`). No new npm deps.
**Storage**: MongoDB/Mongoose — one new collection `feedbackrecords` (userId-indexed, embedded transcript).
**Testing**: Vitest — node-env handler/controller/service tests under `tests/server/`, jsdom context/view tests under `tests/`; `mongodb-memory-server`; agent evals via `holodeck test` (manual, not CI).
**Target Platform**: single Next.js app (`:3000`) + Holodeck sidecar (`:8002`).
**Performance**: chat turn is agent-backed → exempt from CR-008 <200ms (SG-02 precedent, SC-F-005); list/detail/export/delete stay <200ms. Transcript capped (~30 turns) to bound tokens + latency.
**Constraints**: `server-only` on server modules; identity from `authenticate()` (spec 002); RFC-7807 errors; no new state libs (Context + hooks); agent replies raw JSON only.

## Constitution Check

- **Security:** every endpoint behind `authenticate()`; all queries userId-scoped, cross-user → 404 (FR-F-005). User chat is untrusted → marker-framed, agent has no tools, all persisted agent output zod-validated (FR-F-004/011).
- **Testing (TDD):** tests precede impl; backend ≥80% / frontend ≥70%. Agent mocked in controller/handler tests via `vi.mock`.
- **Twelve-Factor:** `FEEDBACK_AGENT_URL` via env (backing service by config URL); stateless transcript replay (no server session state, CR-018); second agent is a disposable container.
- **API-First:** versioned `/api/v1/feedback*`, Problem JSON, rate-limited (10/min chat). ✅ No violations.

## Key Design Decisions

1. **Second Holodeck agent, own container.** One Holodeck instance serves one agent (see `agents/meal-recommender/`), so `feedback-collector` gets its own image + `holodeck-feedback` compose service on `:8002`, reached via `FEEDBACK_AGENT_URL`. No web tools (`allowed_tools: []`) — the agent only converses; this also removes an injection amplifier and keeps turns fast (`llm_timeout: 120`, `temperature: 0.3`).
2. **Stateless transcript replay** (not Holodeck `session_id` reuse). The service serialises the whole transcript into one `message` each turn, framed with untrusted-data markers. Survives container restarts, matches CR-018; token growth bounded by the ~30-turn cap (FR-F-008) with a `FINALIZE NOW` directive at the cap.
3. **Raw-JSON conversation protocol** (mirrors meal-recommender's "RAW JSON ONLY"). Agent returns exactly one object: `{status:"collecting", reply, missing[]}` or `{status:"complete", reply, record{...}}`. The service fence-strips (reusing `parseMealArray`'s approach) then `z.discriminatedUnion('status', …)`-parses. Anything else is treated as agent failure.
4. **Draft-first persistence + fail-safe.** `startConversation` creates the draft with the user message *before* calling the agent; on agent error/invalid output the draft is kept and the controller returns `502` (contrast with recommendations' silent fallback — feedback can't be fabricated, but nothing is lost). FR-F-002/004.
5. **Export = pure renderer.** `lib/feedback-export.ts` turns a complete record into markdown whose headings match `.specify/templates/spec-template.md` (unit-testable in isolation; FR-F-007/SC-F-003).

## Project Structure (this feature, impl/nextjs)

```
agents/feedback-collector/                 # NEW second agent (mirrors meal-recommender/)
├── agent.yaml  agent.serve.yaml  Dockerfile  entrypoint.sh
├── instructions/system-prompt.md
└── schemas/feedback-response.json
docker-compose.yml                         # EDIT: add holodeck-feedback (:8002)
.env.example                               # EDIT: FEEDBACK_AGENT_URL
packages/client/
├── src/server/
│   ├── types/feedback.ts                  # NEW  interfaces + enums + shared zod schemas
│   ├── models/feedback-record.ts          # NEW  Mongoose model
│   ├── services/feedback-collector.ts     # NEW  agent client (framing + parse + zod union)
│   ├── controllers/feedback.ts            # NEW  start/continue/list/get/delete/export
│   └── lib/feedback-export.ts             # NEW  record → spec-template markdown
├── app/api/v1/feedback/
│   ├── route.ts                           # NEW  GET list · POST start (10/min)
│   ├── [id]/route.ts                      # NEW  GET detail · DELETE
│   ├── [id]/messages/route.ts             # NEW  POST continue (10/min)
│   └── [id]/export/route.ts               # NEW  GET markdown (text/markdown)
├── src/services/feedback.ts               # NEW  browser fetch wrappers + types
├── src/context/FeedbackContext.tsx        # NEW  chat state machine + list state
├── src/views/FeedbackPage.tsx             # NEW  container + presentational
├── src/components/feedback/*              # NEW  ChatMessageList · ChatInput · CompletionCard · FeedbackHistory
├── app/feedback/page.tsx                  # NEW  mounts FeedbackProvider + FeedbackPage
└── app/nav.tsx                            # EDIT: add { href:'/feedback', label:'Feedback' }
tests/server/{feedback.test.ts, unit/feedback-export.test.ts, unit/feedback-collector.test.ts}
tests/{context/FeedbackContext.test.tsx, views/FeedbackPage.test.tsx}
```

## Conversation protocol (agent contract)

Backend frames each turn as (user content wrapped in markers, treated as data):
```
<transcript>
[USER] the grocery list is broken
[ASSISTANT] What action were you doing when it broke?
[USER] ...
</transcript>
Respond with the next protocol JSON object only.
```
Agent replies with exactly one of:
- `{"status":"collecting","reply":"<one question>","missing":["reproSteps",...]}`
- `{"status":"complete","reply":"<summary>","record":{type,title,problemStatement,userStory,acceptanceCriteria[{given,when,then}],reproSteps[],expectedBehavior,actualBehavior,affectedArea,priority}}`

At the ~30-turn cap the framing appends `FINALIZE NOW` → agent must return `complete` best-effort, unknowns as `"[unknown]"`.

## Phasing (TDD; tasks in tasks.md)

- **F-NX-1 — Agent** `agents/feedback-collector/` (+ compose service + env). `holodeck test` evals green (manual).
- **F-NX-2 — Types + model** `types/feedback.ts`, `models/feedback-record.ts`.
- **F-NX-3 — Export renderer** (test-first) `lib/feedback-export.ts`.
- **F-NX-4 — Agent service** (test-first, `global.fetch` stub) `services/feedback-collector.ts`.
- **F-NX-5 — Controller** (test-first, `vi.mock` the service) `controllers/feedback.ts`.
- **F-NX-6 — Route handlers** `app/api/v1/feedback/**` (covered by node-env handler tests; `next build` validates).
- **F-NX-7 — Browser service + context** (test-first) `services/feedback.ts`, `context/FeedbackContext.tsx`.
- **F-NX-8 — View + components + page + nav** (test-first) `views/FeedbackPage.tsx`, `components/feedback/*`, `app/feedback/page.tsx`, nav link.
- **Gate:** lint + coverage gates, `next build`, `validate-e2e.sh --no-agent`, live smoke with both agent containers.

## Complexity / Risks

- **Transcript token growth** → ~30-turn cap + forced finalize (FR-F-008).
- **Prompt injection** → marker framing + no tools + zod gate + reply-only rendering + an eval case (FR-F-011).
- **`agent.serve.yaml` drift** → keep model/claude blocks in sync with `agent.yaml`; no `${…}` anywhere in the serve file (holodeck substitutes over raw text incl. comments).
- **Prod second container** → deferred (Phase F6): `docker-compose.prod.yml`, `deploy/checklist.yaml`, CI image, GHCR. Until then the controller 502-degrades where `FEEDBACK_AGENT_URL` is unset/unreachable.

## Next Workflow Steps
`tasks.md` (mimic `/speckit.tasks`) → `/speckit.analyze` cross-check (spec ↔ this plan ↔ tasks) → implement TDD. Shared-spec changes go on `main`; this plan + code stay on `impl/nextjs`.
