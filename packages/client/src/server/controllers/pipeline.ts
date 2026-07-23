import 'server-only';
import mongoose from 'mongoose';
import { FeedbackRecord } from '../models/feedback-record';
import { PipelineItem } from '../models/pipeline-item';
import { assertPromotable } from '../lib/pipeline-transitions';
import { problem, type ControllerResult } from '../http';

const DUPLICATE_KEY_ERROR_CODE = 11000;

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === DUPLICATE_KEY_ERROR_CODE
  );
}

function serialize(doc: InstanceType<typeof PipelineItem>): Record<string, unknown> {
  return doc.toObject() as unknown as Record<string, unknown>;
}

const notFound = (): ControllerResult => problem(404, 'Not Found', 'Feedback conversation not found');

/**
 * POST /api/v1/feedback/:id/promote — promote a completed feedback record into the
 * development pipeline (FR-F-013). Idempotent: a repeat call returns the existing
 * item unchanged, never a duplicate or a reset.
 *
 * [analyze M1] Ordering is load-bearing: the existing-item lookup MUST happen before
 * `assertPromotable`, because the FIRST successful promote flips the source record's
 * status to 'reviewed' — a status-gated re-promote would otherwise wrongly 409 on
 * every call after the first (D1/D6).
 */
export async function promoteFromFeedback(userId: string, feedbackId: string): Promise<ControllerResult> {
  if (!mongoose.isValidObjectId(feedbackId)) return notFound();

  const record = await FeedbackRecord.findOne({ _id: feedbackId, userId });
  if (!record) return notFound();

  const existing = await PipelineItem.findOne({ userId, feedbackRecordId: feedbackId });
  if (existing) return { status: 200, body: { pipelineItem: serialize(existing) } };

  if (!assertPromotable(record)) {
    return problem(
      409,
      'Not Promotable',
      'Only a completed feedback record can be promoted into development.',
    );
  }

  const now = new Date();
  try {
    // assertPromotable(record) guarantees status === 'complete', which is only ever
    // set together with the full structured-record fields (controllers/feedback.ts
    // applyComplete, validated by structuredRecordSchema) — the identity snapshot is
    // never taken from a record with these fields unset.
    const created = await PipelineItem.create({
      userId,
      feedbackRecordId: feedbackId,
      sourceTitle: record.title!,
      sourceType: record.type!,
      sourceAffectedArea: record.affectedArea!,
      stage: 'approved',
      promotedBy: userId,
      promotedAt: now,
      transitions: [{ from: null, to: 'approved', actor: 'human', at: now, isGateApproval: true }],
      artifacts: [],
    });
    record.status = 'reviewed';
    await record.save();
    return { status: 201, body: { pipelineItem: serialize(created) } };
  } catch (err) {
    // Concurrent double-promote race backstop: the unique (userId, feedbackRecordId)
    // index rejects the losing insert — return the winner's item instead of erroring
    // (D1/D12, spec EC "promote an already-promoted record").
    if (isDuplicateKeyError(err)) {
      const winner = await PipelineItem.findOne({ userId, feedbackRecordId: feedbackId });
      if (winner) return { status: 200, body: { pipelineItem: serialize(winner) } };
    }
    throw err;
  }
}
