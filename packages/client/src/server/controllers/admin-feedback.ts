import 'server-only';
import mongoose from 'mongoose';
import { z } from 'zod';
import { FeedbackRecord } from '../models/feedback-record';
import { PipelineItem } from '../models/pipeline-item';
import { record as auditRecord } from '../lib/audit';
import { problem, type ControllerResult } from '../http';

/**
 * Administrator feedback triage (spec 011 US2 — FR-AD-009/014).
 *
 * This is the controller that closes the spec's Defect 2: every ordinary feedback
 * query is `{ userId }`-scoped, so before this existed the maintainer could not read
 * a single report submitted by anyone else — the feature collected feedback and then
 * hid it from the only person able to act on it.
 *
 * Callers are administrator-guarded at the route (`requirePrincipalAdmin`). Nothing
 * here re-checks privilege; it assumes it, which is why these functions must never be
 * wired to a non-admin route.
 *
 * Feedback content stays **inert data** (FR-AD-014): records are returned verbatim to
 * be rendered, never interpreted, and nothing in this module branches on their text.
 */

const listQuerySchema = z.object({
  status: z.enum(['draft', 'complete', 'reviewed']).optional(),
  userId: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

function invalidInput(error: z.ZodError): ControllerResult {
  return problem(400, 'Invalid input', error.issues.map((i) => i.message).join('; '));
}

const notFound = (): ControllerResult =>
  problem(404, 'Not Found', 'Feedback conversation not found');

/**
 * GET /api/v1/admin/feedback — every user's records, newest first, each attributed to
 * its author (FR-AD-009). Transcripts are omitted from the list for size; the detail
 * endpoint carries them.
 */
export async function adminListFeedback(
  adminUserId: string,
  query: URLSearchParams,
): Promise<ControllerResult> {
  const parsed = listQuerySchema.safeParse({
    status: query.get('status') ?? undefined,
    userId: query.get('userId') ?? undefined,
    limit: query.get('limit') ?? undefined,
  });
  if (!parsed.success) return invalidInput(parsed.error);

  // Deliberately NOT scoped by the caller: cross-user visibility is the whole point,
  // and it is legitimate here precisely because the route is admin-guarded (FR-AD-016).
  const filter: Record<string, unknown> = {};
  if (parsed.data.status) filter['status'] = parsed.data.status;
  if (parsed.data.userId) filter['userId'] = parsed.data.userId;

  const docs = await FeedbackRecord.find(filter)
    .select('-transcript')
    .sort({ updatedAt: -1 })
    .limit(parsed.data.limit ?? 100)
    .lean();

  // Attach each record's pipeline stage so triage can filter on it without N queries.
  const ids = docs.map((d) => String(d._id));
  const items = await PipelineItem.find({ feedbackRecordId: { $in: ids } })
    .select('feedbackRecordId stage')
    .lean();
  const stageByRecord = new Map(items.map((i) => [String(i.feedbackRecordId), i.stage]));

  const feedback = docs.map((d) => ({
    ...d,
    pipelineStage: stageByRecord.get(String(d._id)) ?? null,
  }));

  await auditRecord(adminUserId, 'feedback.list');
  return { status: 200, body: { feedback } };
}

/** GET /api/v1/admin/feedback/:id — any user's full record incl. transcript (FR-AD-009). */
export async function adminGetFeedback(adminUserId: string, id: string): Promise<ControllerResult> {
  if (!mongoose.isValidObjectId(id)) return notFound();

  const doc = await FeedbackRecord.findOne({ _id: id }).lean();
  if (!doc) return notFound();

  await auditRecord(adminUserId, 'feedback.read', {
    userId: doc.userId,
    type: 'feedback',
    id: String(doc._id),
  });
  return { status: 200, body: { feedback: doc } };
}
