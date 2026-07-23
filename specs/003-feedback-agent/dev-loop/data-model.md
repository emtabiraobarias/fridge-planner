# Data Model — Feedback→Feature Development Loop (tracking-layer MVP, `impl/nextjs`)

Phase 1 output. **One new collection (`PipelineItem`), no change to the `FeedbackRecord` schema shape.** The pipeline is a separate, owner-scoped tracking/audit document that references its source record (D1); the existing feedback conversation document is untouched except that promotion sets its `status` to `reviewed` through the normal save path (D6). This document enumerates the new schema, enums, indexes, request/response contract additions, transient client state, and back-compat.

## New collection — `PipelineItem` (`src/server/models/pipeline-item.ts`)

Created when a completed FeedbackRecord is promoted (FR-F-013). It **never stores or executes anything executable** — it is a status/audit record over work done by the spec-driven workflow (spec Key Entities; D7/D10).

```typescript
// src/server/types/pipeline.ts — enums + shapes (shared by model, controller, transition lib)
export const PIPELINE_STAGES = ['approved', 'in-spec', 'in-review', 'shipped', 'parked'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// Forward-only ordinal for the four active stages; 'parked' is terminal (off-ordinal). (D3)
export const STAGE_ORDINAL: Record<Exclude<PipelineStage, 'parked'>, number> = {
  approved: 0, 'in-spec': 1, 'in-review': 2, shipped: 3,
};

export const TRANSITION_ACTIONS = [
  'advance', 'approve-spec', 'approve-release', 'park', 'reopen', 'attach-artifact',
] as const;
export type TransitionAction = (typeof TRANSITION_ACTIONS)[number];

export const TRANSITION_ACTORS = ['human', 'session'] as const;
export type TransitionActor = (typeof TRANSITION_ACTORS)[number];

export const ARTIFACT_TYPES = ['draft-spec', 'pull-request'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export interface ITransitionLogEntry {
  from: PipelineStage | null;   // null only on the seed (promotion) entry
  to: PipelineStage;
  actor: TransitionActor;       // audit label, not an identity/permission (D6)
  at: Date;
  isGateApproval: boolean;      // set by the endpoint from the action verb — never client-forgeable (D3)
  note?: string;
}

export interface IArtifactLink {
  type: ArtifactType;           // 'draft-spec' | 'pull-request'
  ref: string;                  // a URL / spec-dir path — a REFERENCE only, never content (D7/D11)
  at: Date;
  note?: string;
}

export interface IPipelineItem {
  userId: string;               // owner (FR-F-005/018) — every query is scoped to this
  feedbackRecordId: string;     // references the source FeedbackRecord (D1)

  // Immutable identity snapshot taken at promotion (D2) — frozen because only completed records promote.
  sourceTitle: string;
  sourceType: 'bug' | 'improvement';
  sourceAffectedArea: string;

  stage: PipelineStage;         // denormalized current stage (indexed for the status view)
  parkedFromStage?: PipelineStage; // the active stage held before a park, for reopen (D3)

  promotedBy: string;           // = userId, the approving maintainer (FR-F-013)
  promotedAt: Date;

  transitions: ITransitionLogEntry[]; // append-only audit log (FR-F-014)
  artifacts: IArtifactLink[];         // append-only draft-spec / PR links (FR-F-015)

  createdAt: Date;
  updatedAt: Date;
}
```

### Schema notes

- `stage` has **no default** at insert time is irrelevant — promotion always seeds it to `'approved'` explicitly together with the first `transitions` entry `{ from: null, to: 'approved', actor: 'human', isGateApproval: true, at }` (D6). `parked` is terminal for success semantics: `shipped` cannot be parked (D3).
- `transitions` and `artifacts` subdocs use `{ _id: false }` (they are ordered logs, not addressable resources), matching the `messageSchema`/`acceptanceCriterionSchema` convention in `feedback-record.ts:7-23`.
- Hot-reload-guarded model export (`mongoose.models['PipelineItem'] ?? mongoose.model(...)`), identical to `feedback-record.ts:50-52`.
- `import 'server-only'` at the top of the model, type, controller, and transition lib (CLAUDE.md §7/§14). The **types** file (enums + interfaces + Zod) is server-only; the browser mirrors the read shape in `src/services/pipeline.ts` (client types), same split as `feedback.ts` ↔ `services/feedback.ts`.

### Indexes

| Index | Purpose |
|-------|---------|
| `{ userId: 1, feedbackRecordId: 1 }` **unique** | Enforces idempotent promotion (FR-F-013) at the DB layer — a second promote hits the existing item (D1). |
| `{ userId: 1, stage: 1 }` | Serves the owner-scoped status view + `?stage=` filter (FR-F-015, D8). |
| `{ userId: 1, updatedAt: -1 }` (or reuse the above + sort) | Recency ordering for the list view. |

## `FeedbackRecord` — unchanged shape; one status side effect

- **No field added.** Promotion sets the existing `status` from `complete` → `reviewed` (the `reviewed` value already exists in `FEEDBACK_STATUSES`, `types/feedback.ts:21`) through the normal `doc.save()` path — the concrete triage action the spec's forward-looking `reviewed` status anticipated (Key Entities note, D6). Pipeline stage, not `status`, is the source of truth for delivery progress.
- A record is promotable **only** when `status === 'complete'` and it passes the FR-F-003 required-field schema (drafts refused, FR-F-013). Reuse the existing completeness guarantee: a `complete` record has already passed `structuredRecordSchema` at save time (`controllers/feedback.ts:113`, SC-F-002), so `assertPromotable` need only check `status === 'complete'`.

## Request/response contract additions

*(Full contract in `contracts/dev-loop-api.md`. Shapes summarized here.)*

### `POST /api/v1/feedback/:id/promote` — NEW

- **Request**: no body (or `{}`). Owner-scoped by `authenticate`.
- **Response 201** (first promotion) / **200** (idempotent re-promote): `{ pipelineItem: PipelineItem }`.
- **409** if the record is `draft`/incomplete (not promotable). **404** if the record does not exist or belongs to another user (no existence leak, FR-F-005).

### `GET /api/v1/pipeline` — NEW (status view, FR-F-015)

- **Query**: optional `?stage=<PipelineStage>`.
- **Response 200**: `{ pipeline: PipelineItemSummary[] }` — owner-scoped, `updatedAt` desc. Summary omits nothing sensitive; includes `stage`, `sourceTitle`, `sourceType`, `artifacts`, timestamps. (Transition log returned by the detail endpoint to keep the list lean.)

### `GET /api/v1/pipeline/:id` — NEW

- **Response 200**: `{ pipelineItem: PipelineItem }` incl. full `transitions` log. **404** cross-user/missing.

### `PATCH /api/v1/pipeline/:id` — NEW (transition, D4)

- **Request** — Zod discriminated union on `action`:
  ```typescript
  | { action: 'advance'; actor?: TransitionActor; note?: string }
  | { action: 'approve-spec'; actor?: TransitionActor; note?: string }
  | { action: 'approve-release'; actor?: TransitionActor; note?: string }
  | { action: 'park'; reason?: string }
  | { action: 'reopen' }
  | { action: 'attach-artifact'; artifact: { type: ArtifactType; ref: string; note?: string } }
  ```
- **Response 200**: `{ pipelineItem: PipelineItem }` (post-transition). **409** illegal/gated transition (guard mismatch). **404** cross-user/missing. **400** invalid body.

### `DELETE /api/v1/feedback/:id` — CHANGED (delete-protection, EC-06, D9)

- Now **409** ("record is in the active development pipeline — park it first") when a non-`parked` PipelineItem references it. Proceeds (and cascades a `parked` item's deletion) otherwise. Existing 204/404 behavior unchanged for records with no pipeline item.

## Transient / client-state shapes

Held in React context/component state only (constitution: Context + hooks, no store).

```typescript
// src/context/PipelineContext.tsx (D8) — the status-view read model + actions
interface PipelineContextValue {
  items: PipelineItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  promote: (feedbackId: string) => Promise<PipelineItem>;
  transition: (id: string, body: TransitionRequest) => Promise<PipelineItem>;
}
```

- No new persisted client state; the list is fetched from `GET /api/v1/pipeline` and refreshed after promote/transition. Mirrors `FeedbackContext`'s `records`/`refreshList` pattern (`context/FeedbackContext.tsx:39-51`).

## Reuse map (no new infrastructure)

| Concern | Reused as-is | Where |
|---------|--------------|-------|
| Record→spec seed (draft-spec text) | `renderFeedbackMarkdown` | `lib/feedback-export.ts` (D11) |
| Completeness guarantee for promotability | `structuredRecordSchema` already enforced at save | `types/feedback.ts:74`, `controllers/feedback.ts:113` |
| Atomic guarded transition (409 on illegal) | `findOneAndUpdate` guard pattern | precedent `controllers/grocery-lists.ts:145-205` |
| PATCH action-union dispatch | discriminated-union controller dispatch | precedent spec 006 `entries/[slotId]` cook/uncook |
| Handler stack | `authenticate` / `connectDb` / `withRoute` / `problem()` / `rateLimit` | `src/server/{auth,db,route-helpers,http,rate-limit}.ts` |
| Browser fetch wrappers | `apiFetch` / `ensureOk` | `src/services/http.ts` |
| Hot-reload-guarded model | `mongoose.models[...] ?? mongoose.model(...)` | `models/feedback-record.ts:50` |

## Back-compat

- **Pre-revision FeedbackRecords**: have **no** PipelineItem — the status view is simply empty for them until promoted; nothing to migrate, no null pipeline fields on any existing record (D1).
- **Existing feedback endpoints** (chat, list, detail, export): unchanged. Only `DELETE /feedback/:id` gains the delete-protection guard (D9), which is a no-op for any record without an active pipeline item.
- **`reviewed` status**: already a valid `FEEDBACK_STATUSES` value; promotion is the first code path that sets it — additive, not a schema change.
- **No new npm dependency**, no new service, no state library (CLAUDE.md §14).
