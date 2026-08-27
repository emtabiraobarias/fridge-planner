import { apiFetch, ensureOk } from './http';

/**
 * Browser fetchers for the lifecycle (spec 012). Talks to the API only — never imports
 * `src/server/*`, which is Node-only and guarded by `server-only`.
 *
 * A **403** from any of these means the caller is not an administrator. The UI must treat that
 * as "not available", never as a broken session — a 401 is what means the session broke, and
 * conflating them sends the client into its FR-D-010 refresh-and-retry loop.
 */

export type LifecycleStage =
  | 'new'
  | 'accepted'
  | 'briefed'
  | 'in-spec'
  | 'in-progress'
  | 'in-review'
  | 'shipped'
  | 'closed'
  | 'dismissed'
  | 'merged'
  | 'parked';

export type DismissalReason = 'no-action-required' | 'declined';

export interface LifecycleArtifact {
  type: 'draft-spec' | 'pull-request';
  /** A reference the maintainer opens. Never dereferenced by the app (FR-FL-057). */
  ref: string;
  at: string;
  note?: string;
}

export interface LifecycleSummary {
  _id: string;
  userId: string;
  sourceTitle: string;
  sourceType: 'bug' | 'improvement';
  sourceAffectedArea: string;
  stage: LifecycleStage;
  rank?: number;
  dismissalReason?: DismissalReason;
  reporterErasedAt?: string;
  artifacts?: LifecycleArtifact[];
  updatedAt: string;
}

export type LifecycleAction =
  | { action: 'accept' }
  | { action: 'dismiss'; reason: DismissalReason }
  | { action: 'merge'; targetId: string }
  | { action: 'advance' }
  | { action: 'approve-spec' }
  | { action: 'reject-spec'; note?: string }
  | { action: 'approve-release' }
  | { action: 'reject-release'; note?: string }
  | { action: 'park'; note?: string }
  | { action: 'reopen' }
  | { action: 'set-rank'; rank: number }
  | { action: 'edit-source'; sourceTitle?: string; sourceAffectedArea?: string }
  | {
      action: 'close';
      excerpt: string;
      releaseTag?: string;
      releaseUrl?: string;
      releaseFallbackText?: string;
      unavailableReason?: string;
    }
  | { action: 'cite'; citedId: string }
  | { action: 'attach-artifact'; artifact: { type: 'draft-spec' | 'pull-request'; ref: string } };

export interface QueueQuery {
  stage?: LifecycleStage;
  userId?: string;
}

/** The maintainer's cross-user triage queue (FR-FL-023). */
export async function fetchQueue(query: QueueQuery = {}): Promise<LifecycleSummary[]> {
  const params = new URLSearchParams();
  if (query.stage) params.set('stage', query.stage);
  if (query.userId) params.set('userId', query.userId);
  const qs = params.toString();
  const res = await apiFetch(`/api/v1/admin/lifecycle${qs ? `?${qs}` : ''}`);
  const body = (await ensureOk(res, 'load the triage queue').json()) as {
    items: LifecycleSummary[];
  };
  return body.items;
}

/** Apply one maintainer action. Rejects on 409 so the caller can surface the refusal. */
export async function applyLifecycleAction(
  id: string,
  action: LifecycleAction,
): Promise<LifecycleSummary> {
  const res = await apiFetch(`/api/v1/admin/lifecycle/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
  });
  return (await ensureOk(res, 'update this item').json()) as LifecycleSummary;
}

export interface ReporterItem {
  _id: string;
  sourceTitle: string;
  stage: LifecycleStage;
  /** Reporter-facing wording, decided server-side (FR-FL-035). */
  stageLabel: string;
  dismissalReason?: DismissalReason;
  reply?: { text: string; at: string };
  closure?: { excerpt: string; releaseTag?: string; releaseUrl?: string };
  /** Present only for a merged item — the target's stage and nothing else (FR-FL-019). */
  mergedTargetStage?: LifecycleStage;
  updatedAt: string;
}

/** The reporter's own items. Not admin-guarded — this is what they get back for reporting. */
export async function fetchOwnLifecycle(): Promise<ReporterItem[]> {
  const res = await apiFetch('/api/v1/lifecycle');
  const body = (await ensureOk(res, 'load your reports').json()) as { items: ReporterItem[] };
  return body.items;
}

export interface Release {
  tag: string;
  name: string;
  url: string;
  publishedAt: string;
  /** `tag` when the repo publishes git tags rather than GitHub Release objects. */
  source: 'release' | 'tag';
}

export interface ReleaseList {
  releases: Release[];
  available: boolean;
  unavailableReason?: string;
}

/**
 * The closure picker's release list.
 *
 * `available: false` is a NORMAL answer, not an error — the endpoint returns 200 even when
 * GitHub is unreachable, because closure must never be gated on a third party (FR-FL-045).
 */
export async function fetchReleaseList(): Promise<ReleaseList> {
  const res = await apiFetch('/api/v1/admin/releases');
  return (await ensureOk(res, 'load the release list').json()) as ReleaseList;
}

export interface Clause {
  provisionalId: string;
  text: string;
  /** The record text this was derived from — displayed BESIDE the clause (FR-FL-025). */
  derivedFrom: string;
  inferred: boolean;
  vetted: 'pending' | 'accepted' | 'rejected';
  editedText?: string;
}

export async function fetchClauses(id: string): Promise<Clause[]> {
  const res = await apiFetch(`/api/v1/admin/lifecycle/${id}/clauses`);
  return ((await ensureOk(res, 'load the clauses').json()) as { clauses: Clause[] }).clauses;
}

/** Ask the agent to draft. Returns however many it managed — zero is a valid answer. */
export async function draftClauses(id: string): Promise<Clause[]> {
  const res = await apiFetch(`/api/v1/admin/lifecycle/${id}/clauses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  return ((await ensureOk(res, 'draft clauses').json()) as { clauses: Clause[] }).clauses ?? [];
}

export async function vetClause(
  id: string,
  provisionalId: string,
  vetted: 'accepted' | 'rejected',
  editedText?: string,
): Promise<Clause[]> {
  const res = await apiFetch(`/api/v1/admin/lifecycle/${id}/clauses/${provisionalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vetted, ...(editedText ? { editedText } : {}) }),
  });
  return ((await ensureOk(res, 'vet the clause').json()) as { clauses: Clause[] }).clauses;
}
