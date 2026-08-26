import 'server-only';
import { LifecycleItem } from '../models/lifecycle-item';
import { problem, type ControllerResult } from '../http';
import { record as auditRecord } from '../lib/audit';
import { LIFECYCLE_STAGES, type LifecycleStage } from '../lib/lifecycle-stages';

/**
 * The maintainer's cross-user view (spec 012 US1, FR-FL-023).
 *
 * Deliberately NOT user-scoped — that is the whole point of a triage queue, and the reason it
 * lives behind `requirePrincipalAdmin` at the route rather than relying on a `{userId}` filter
 * the way every reporter-facing query does.
 */

export interface QueueFilters {
  stage?: LifecycleStage;
  userId?: string;
}

function isStage(v: string | null): v is LifecycleStage {
  return v !== null && (LIFECYCLE_STAGES as readonly string[]).includes(v);
}

export function parseQueueFilters(params: URLSearchParams): QueueFilters {
  const stage = params.get('stage');
  const userId = params.get('userId');
  return {
    ...(isStage(stage) ? { stage } : {}),
    ...(userId ? { userId } : {}),
  };
}

/**
 * The queue, in rank order (FR-FL-022) — a ranked queue, not a flat list.
 *
 * Unranked items sort last rather than first: a maintainer who has ranked nothing should see the
 * most recent work, not an arbitrary slice of everything ever filed.
 *
 * That requires substituting a sort key, NOT `.sort({ rank: 1 })`. Mongo treats a missing field
 * as null, and null sorts *before* any number ascending — so a plain rank sort buried every
 * ranked item beneath every unranked one, the exact inverse of the paragraph above. The
 * original test compared two items that both had a rank, so it never saw it.
 */
const UNRANKED_LAST = Number.MAX_SAFE_INTEGER;

export async function listQueue(filters: QueueFilters = {}): Promise<ControllerResult> {
  const query: Record<string, unknown> = {};
  if (filters.stage) query['stage'] = filters.stage;
  if (filters.userId) query['userId'] = filters.userId;

  const items = await LifecycleItem.aggregate([
    { $match: query },
    { $addFields: { _rankKey: { $ifNull: ['$rank', UNRANKED_LAST] } } },
    { $sort: { _rankKey: 1, updatedAt: -1 } },
    { $project: { transitions: 0, clauses: 0, _rankKey: 0 } },
  ]);

  return { status: 200, body: { items } };
}

/** One item in full — transitions, clauses, reply, closure. */
export async function getItem(id: string, adminUserId: string): Promise<ControllerResult> {
  const item = await LifecycleItem.findById(id).lean();
  if (!item) return problem(404, 'Not Found', 'No such lifecycle item.');

  await auditRecord(adminUserId, 'feedback.read', {
    id,
    type: 'lifecycle',
    userId: item.userId,
  });
  return { status: 200, body: item };
}
