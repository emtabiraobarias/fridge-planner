import { ensureOk, apiFetch } from './http';

export type PipelineStage = 'approved' | 'in-spec' | 'in-review' | 'shipped' | 'parked';
export type TransitionAction = 'advance' | 'approve-spec' | 'approve-release' | 'park' | 'reopen' | 'attach-artifact';
export type TransitionActor = 'human' | 'session';
export type ArtifactType = 'draft-spec' | 'pull-request';

export interface ArtifactLink {
  type: ArtifactType;
  ref: string;
  at: string;
  note?: string;
}

export interface TransitionLogEntry {
  from: PipelineStage | null;
  to: PipelineStage;
  actor: TransitionActor;
  at: string;
  isGateApproval: boolean;
  note?: string;
}

/** The list-view projection returned by `GET /pipeline` — no `transitions` log (kept lean). */
export interface PipelineItemSummary {
  _id: string;
  feedbackRecordId: string;
  stage: PipelineStage;
  sourceTitle: string;
  sourceType: 'bug' | 'improvement';
  sourceAffectedArea: string;
  artifacts: ArtifactLink[];
  promotedAt: string;
  updatedAt: string;
}

/** The full detail shape (promote / `GET`+`PATCH /pipeline/:id`) incl. the transitions log. */
export interface PipelineItem extends PipelineItemSummary {
  parkedFromStage?: PipelineStage;
  promotedBy: string;
  transitions: TransitionLogEntry[];
  createdAt: string;
}

export type TransitionRequest =
  | { action: 'advance'; actor?: TransitionActor; note?: string }
  | { action: 'approve-spec'; actor?: TransitionActor; note?: string }
  | { action: 'approve-release'; actor?: TransitionActor; note?: string }
  | { action: 'park'; reason?: string }
  | { action: 'reopen' }
  | { action: 'attach-artifact'; artifact: { type: ArtifactType; ref: string; note?: string } };

const FEEDBACK_BASE = '/api/v1/feedback';
const PIPELINE_BASE = '/api/v1/pipeline';

/** POST /feedback/:id/promote — idempotent; 409 on a draft/incomplete record (FR-F-013). */
export async function promoteFeedback(feedbackId: string): Promise<PipelineItem> {
  const res = await apiFetch(`${FEEDBACK_BASE}/${feedbackId}/promote`, { method: 'POST' });
  ensureOk(res, 'promote feedback');
  const data = (await res.json()) as { pipelineItem: PipelineItem };
  return data.pipelineItem;
}

/** GET /pipeline[?stage=] — the caller's promoted records, status-view projection (FR-F-015). */
export async function fetchPipeline(stage?: PipelineStage): Promise<PipelineItemSummary[]> {
  const query = stage ? `?stage=${stage}` : '';
  const res = await apiFetch(`${PIPELINE_BASE}${query}`);
  ensureOk(res, 'load pipeline');
  const data = (await res.json()) as { pipeline: PipelineItemSummary[] };
  return data.pipeline;
}

/** GET /pipeline/:id — full item incl. the transitions audit log (FR-F-014). */
export async function fetchPipelineItem(id: string): Promise<PipelineItem> {
  const res = await apiFetch(`${PIPELINE_BASE}/${id}`);
  ensureOk(res, 'load pipeline item');
  const data = (await res.json()) as { pipelineItem: PipelineItem };
  return data.pipelineItem;
}

/** PATCH /pipeline/:id — a guarded transition or an artifact attach (FR-F-014/015/016). */
export async function transitionPipelineItem(id: string, body: TransitionRequest): Promise<PipelineItem> {
  const res = await apiFetch(`${PIPELINE_BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  ensureOk(res, 'update pipeline item');
  const data = (await res.json()) as { pipelineItem: PipelineItem };
  return data.pipelineItem;
}
