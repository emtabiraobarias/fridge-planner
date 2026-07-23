# API Contract — Feedback→Feature Development Loop (tracking-layer MVP, `impl/nextjs`)

Phase 1 output. The revision adds a **promote** action on the feedback route tree and a small **pipeline** resource for the status view + human-gated transitions. Every endpoint uses `authenticate()` (owner-scoped, FR-F-005/018), route-level `rateLimit`, and RFC-7807 Problem JSON via `withRoute`/`problem()`. Handlers stay thin (parse → authenticate → controller → `NextResponse.json`); logic lives in `controllers/pipeline.ts` + the pure `lib/pipeline-transitions.ts`.

> **Safety invariant, stated once and binding on every endpoint below (FR-F-016/017/018):**
> **No endpoint in this contract performs — directly or indirectly — a git commit/branch/merge, a release tag, a CI trigger, or a deployment.** `attach-artifact` stores a reference *string* only; `approve-release` flips a status field and records a gate approval — the actual merge/tag/deploy is done by a human *outside the app* (CLAUDE.md §10/§15). No transition is ever derived from FeedbackRecord content — transitions occur **only** on an explicit authenticated maintainer request. These are verified by tests (SC-F-008), including an architecture test that the pipeline controller imports no `child_process`/git/exec/deploy client.

## Rate-limit tiers

| Endpoint | Tier | Key |
|----------|------|-----|
| `POST /feedback/:id/promote` | 100/min (default — maintainer action, not assistant-backed, FR-F-009) | `promote:${userId}` |
| `GET /pipeline`, `GET /pipeline/:id`, `PATCH /pipeline/:id` | 100/min (default) | `pipeline:${userId}` |

---

## POST /api/v1/feedback/:id/promote — NEW (FR-F-013)

Promote a completed, schema-valid feedback record into the development pipeline. **Idempotent.**

- **Auth**: `authenticate(request)` → `userId`. Record looked up by `{ _id: id, userId }` — a missing or other-user record is **404** with no existence leak (FR-F-005).
- **Guard**: only `status === 'complete'` records are promotable (a `complete` record has already passed `structuredRecordSchema`, SC-F-002). `draft`/incomplete → **409**.
- **Idempotency**: find-or-create against the unique `(userId, feedbackRecordId)` index (D1). First promotion **creates** the item (201); a repeat returns the **existing** item unchanged (200) — never duplicated or reset (spec EC "promote an already-promoted record").
- **Effects**: creates the PipelineItem at `stage: 'approved'` with the seed transition `{ from: null, to: 'approved', actor: 'human', isGateApproval: true }`, denormalized identity snapshot (D2), `promotedBy`/`promotedAt`; sets the source record `status: 'reviewed'` (D6).

### Request

No body required (`{}` accepted). No field is read from request content that could drive a transition (FR-F-018).

### Responses

| Status | Body | When |
|--------|------|------|
| 201 | `{ "pipelineItem": PipelineItem }` | first promotion — item created at `approved` |
| 200 | `{ "pipelineItem": PipelineItem }` | already promoted — existing item returned (idempotent) |
| 409 | Problem `Not Promotable` | record is `draft`/incomplete |
| 404 | Problem `Not Found` | record missing or owned by another user |
| 401 | Problem | unauthenticated |
| 429 | Problem | >100/min for this user |

---

## GET /api/v1/pipeline — NEW (status view, FR-F-015)

List the maintainer's promoted records with stage + artifact links — the in-app tracker (no hand-maintained sheet, SC-F-007).

- **Auth**: owner-scoped `find({ userId })`, `updatedAt` desc.
- **Query**: optional `?stage=approved|in-spec|in-review|shipped|parked` (Zod-validated; invalid → 400).

### Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "pipeline": PipelineItemSummary[] }` | owner's items (optionally stage-filtered) |
| 400 | Problem | invalid `stage` query value |
| 401 | Problem | unauthenticated |

`PipelineItemSummary` = `{ _id, feedbackRecordId, stage, sourceTitle, sourceType, sourceAffectedArea, artifacts, promotedAt, updatedAt }` (transition log excluded from the list — see detail).

---

## GET /api/v1/pipeline/:id — NEW

Full pipeline item incl. the ordered `transitions` audit log (FR-F-014).

| Status | Body | When |
|--------|------|------|
| 200 | `{ "pipelineItem": PipelineItem }` | owner's item |
| 404 | Problem `Not Found` | missing or other-user (no existence leak) |
| 401 | Problem | unauthenticated |

---

## PATCH /api/v1/pipeline/:id — NEW (human-gated transitions, FR-F-014/016/017)

One route, a **Zod discriminated union on `action`** (D4). The controller composes the pure `nextStage(current, action)` (`lib/pipeline-transitions.ts`, D5) with an **atomic guarded update** `findOneAndUpdate({ _id: id, userId, stage: <expected-from> }, …)` — a guard mismatch (illegal/gated/concurrent transition) returns **409** (precedent: `controllers/grocery-lists.ts:145-205`). `isGateApproval` is set by the endpoint from the action verb, never from the client.

### Transition legality (D3)

| `action` | Valid from | → to | Gate | Notes |
|----------|-----------|------|------|-------|
| `advance` | `approved` | `in-spec` | no | the only non-gated forward step (draft spec produced) |
| `approve-spec` | `in-spec` | `in-review` | **yes** | spec-approval gate (FR-F-016); records `isGateApproval: true` |
| `approve-release` | `in-review` | `shipped` | **yes** | pre-merge/pre-release gate (FR-F-016); records `isGateApproval: true`. Flips status only — performs **no** merge/tag/deploy (FR-F-017) |
| `park` | `approved` \| `in-spec` \| `in-review` | `parked` | no | terminal; idempotent if already `parked`; stores `parkedFromStage` |
| `reopen` | `parked` | `parkedFromStage` (else `approved`) | no | the only sanctioned non-forward move (FR-F-014) |
| `attach-artifact` | any non-shipped active stage (+ `shipped` allowed for the final PR) | *(no stage change)* | no | appends `{ type, ref, at }` to `artifacts` (FR-F-015); `ref` is a link string only (FR-F-017) |

`advance` from `in-spec`/`in-review` → **409** ("gated transition — use `approve-spec`/`approve-release`"). Any backward or multi-step jump → **409** ("illegal transition"). `park` of `shipped` → **409**.

### Request (examples)

```jsonc
{ "action": "advance", "actor": "session", "note": "draft spec drafted from export" }
{ "action": "approve-spec", "actor": "human" }
{ "action": "approve-release", "actor": "human", "note": "PR #42 approved for merge" }
{ "action": "park", "reason": "not worth building this cycle" }
{ "action": "reopen" }
{ "action": "attach-artifact", "artifact": { "type": "draft-spec", "ref": "specs/010-foo/spec.md" } }
{ "action": "attach-artifact", "artifact": { "type": "pull-request", "ref": "https://github.com/…/pull/42" } }
```

- `actor` optional (`'human'|'session'`); defaults per action (gates → `human`, `advance`/`attach-artifact` → `session`). It is an **audit label**, not a permission (D6).
- `attach-artifact.ref` is a bounded string (Zod `.max(2048)`), stored verbatim — never fetched or executed by the app.

### Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "pipelineItem": PipelineItem }` | transition applied (or idempotent no-op, e.g. re-`park`) |
| 409 | Problem `Illegal Transition` | guard mismatch — illegal stage, gated step via `advance`, backward/jump, or park of `shipped` |
| 404 | Problem `Not Found` | missing or other-user item (no existence leak) |
| 400 | Problem | invalid body / unknown action / missing `artifact` |
| 401 | Problem | unauthenticated |
| 429 | Problem | >100/min for this user |

---

## DELETE /api/v1/feedback/:id — CHANGED (delete-protection, EC-06, D9)

The existing delete gains a pipeline guard so pipeline state is never left dangling.

- **Active pipeline** (a non-`parked` PipelineItem references the record) → **409** `Pipeline Active` ("This record is in the active development pipeline. Park it first."). No deletion.
- **No pipeline item, or only a `parked` one** → proceeds as today (**204**) and **cascades** the `parked` item's deletion in the same operation.
- Missing/other-user → **404** (unchanged).

| Status | Body | When |
|--------|------|------|
| 204 | *(none)* | deleted (no item, or a parked item cascaded) |
| 409 | Problem `Pipeline Active` | an active (non-parked) pipeline item exists |
| 404 | Problem `Not Found` | missing or other-user |

---

## Error model

All errors are RFC-7807 Problem JSON via `problem(status, title, detail)` (`src/server/http.ts:11`) → `NextResponse.json`. Titles above (`Not Promotable`, `Illegal Transition`, `Pipeline Active`, `Not Found`) are the `title`; `detail` is a human-readable sentence. 404 is used uniformly for cross-user access to avoid leaking existence (FR-F-005).

## What stays identical

- All spec-`003` chat/list/detail/export endpoints (`POST /feedback`, `POST /feedback/:id/messages`, `GET /feedback[?status]`, `GET /feedback/:id`, `GET /feedback/:id/export`) — **unchanged**. The 10/min agent-chat tier is untouched (FR-F-009).
- `renderFeedbackMarkdown` / the export contract — **unchanged**; it is the reused draft-spec seed (D11).
- No new npm dependency, no new service, no new status code family beyond the 200/201/400/401/404/409/429 already used across the API.
