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
  | { action: 'edit-source'; sourceTitle?: string; sourceAffectedArea?: string };

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
