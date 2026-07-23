import 'server-only';
import mongoose from 'mongoose';
import { FeedbackRecord } from '../models/feedback-record';
import { PipelineItem } from '../models/pipeline-item';
import { assertPromotable, isGateAction, nextStage } from '../lib/pipeline-transitions';
import { problem, type ControllerResult } from '../http';
import {
  pipelineListQuerySchema,
  transitionRequestSchema,
  type ArtifactType,
  type IArtifactLink,
  type ITransitionLogEntry,
  type PipelineStage,
  type TransitionActor,
  type TransitionRequest,
} from '../types/pipeline';

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
const notFoundItem = (): ControllerResult => problem(404, 'Not Found', 'Pipeline item not found');

type PipelineDoc = InstanceType<typeof PipelineItem>;

/** Audit label only (D6): defaults gates → 'human', everything else → 'session'. */
function resolveActor(data: TransitionRequest): TransitionActor {
  const provided = 'actor' in data ? data.actor : undefined;
  return provided ?? (isGateAction(data.action) ? 'human' : 'session');
}

/** `note` for advance/gates, `reason` for park — folded into the log entry's note. */
function resolveNote(data: TransitionRequest): string | undefined {
  if ('note' in data) return data.note;
  if ('reason' in data) return data.reason;
  return undefined;
}

/**
 * attach-artifact is an annotation, never a stage transition — it MUST bypass the
 * stage-guard path so it can never append a `to:'shipped'` (or any) transition log
 * entry (protects SC-F-008). `ref` is a bounded string stored verbatim (FR-F-017).
 */
async function appendArtifact(
  userId: string,
  id: string,
  artifact: { type: ArtifactType; ref: string; note?: string | undefined },
  now: Date,
): Promise<ControllerResult> {
  const entry: IArtifactLink = {
    type: artifact.type,
    ref: artifact.ref,
    at: now,
    ...(artifact.note ? { note: artifact.note } : {}),
  };
  const updated = await PipelineItem.findOneAndUpdate(
    { _id: id, userId },
    { $push: { artifacts: entry } },
    { new: true },
  );
  if (!updated) return notFoundItem();
  return { status: 200, body: { pipelineItem: serialize(updated) } };
}

/**
 * Apply a computed stage transition with an ATOMIC GUARD on the pre-state
 * (precedent: controllers/grocery-lists.ts:143-172). A concurrent/raced change moves
 * the item off `current.stage`, so the guard matches nothing → 409 (never a silent
 * double-apply). `isGateApproval` is derived server-side from the action verb via
 * `isGateAction` — NEVER read from the request body (FR-F-016): the two named gates
 * are the only transitions that can carry `isGateApproval:true`.
 */
async function applyStageTransition(
  userId: string,
  id: string,
  current: PipelineDoc,
  data: TransitionRequest,
  to: PipelineStage,
  now: Date,
): Promise<ControllerResult> {
  const note = resolveNote(data);
  const entry: ITransitionLogEntry = {
    from: current.stage,
    to,
    actor: resolveActor(data),
    at: now,
    isGateApproval: isGateAction(data.action),
    ...(note ? { note } : {}),
  };
  const setFields: Record<string, unknown> = { stage: to };
  if (data.action === 'park') setFields['parkedFromStage'] = current.stage;

  const updated = await PipelineItem.findOneAndUpdate(
    { _id: id, userId, stage: current.stage },
    { $set: setFields, $push: { transitions: entry } },
    { new: true },
  );
  if (!updated) {
    return problem(409, 'Illegal Transition', 'Pipeline item changed concurrently; retry the transition.');
  }
  return { status: 200, body: { pipelineItem: serialize(updated) } };
}

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

/**
 * GET /api/v1/pipeline/:id — owner-scoped full item incl. the ordered transitions
 * audit log (FR-F-014). A missing or other-user item is 404 (no existence leak, FR-F-005).
 */
export async function getPipelineItem(userId: string, id: string): Promise<ControllerResult> {
  if (!mongoose.isValidObjectId(id)) return notFoundItem();
  const item = await PipelineItem.findOne({ _id: id, userId });
  if (!item) return notFoundItem();
  return { status: 200, body: { pipelineItem: serialize(item) } };
}

/**
 * GET /api/v1/pipeline — owner-scoped list for the status view (FR-F-015), sorted
 * `updatedAt` desc and projected to the `PipelineItemSummary` shape (no `transitions`
 * log — kept lean; the full log is served by `getPipelineItem`). Optional `?stage=`
 * filter, Zod-validated (400 on an invalid value).
 */
export async function listPipeline(userId: string, query: URLSearchParams): Promise<ControllerResult> {
  const parsed = pipelineListQuerySchema.safeParse({ stage: query.get('stage') ?? undefined });
  if (!parsed.success) {
    return problem(400, 'Invalid input', parsed.error.issues.map((i) => i.message).join('; '));
  }

  const filter: Record<string, unknown> = { userId };
  if (parsed.data.stage) filter['stage'] = parsed.data.stage;

  const docs = await PipelineItem.find(filter).select('-transitions').sort({ updatedAt: -1 }).lean();

  return { status: 200, body: { pipeline: docs } };
}

/**
 * PATCH /api/v1/pipeline/:id — a Zod discriminated-union on `action` (D4) composed with
 * the pure `nextStage` state machine (D5) and an atomic guarded write (D4). No endpoint
 * here performs a git/merge/tag/deploy side effect (FR-F-017), and NO transition is ever
 * derived from FeedbackRecord content — only from this explicit, authenticated request
 * (FR-F-018). The named gates `approve-spec`/`approve-release` are the sole paths past
 * `in-spec` and into `shipped` (FR-F-016, SC-F-008).
 */
export async function transitionPipelineItem(
  userId: string,
  id: string,
  body: unknown,
): Promise<ControllerResult> {
  if (!mongoose.isValidObjectId(id)) return notFoundItem();

  const parsed = transitionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, 'Invalid input', parsed.error.issues.map((i) => i.message).join('; '));
  }
  const data = parsed.data;

  const current = await PipelineItem.findOne({ _id: id, userId });
  if (!current) return notFoundItem();

  const now = new Date();

  if (data.action === 'attach-artifact') {
    return appendArtifact(userId, id, data.artifact, now);
  }

  // Idempotent re-park: an already-parked item stays parked with no new log entry and
  // its `parkedFromStage` preserved (re-writing it would corrupt reopen's destination).
  if (data.action === 'park' && current.stage === 'parked') {
    return { status: 200, body: { pipelineItem: serialize(current) } };
  }

  const ctx = current.parkedFromStage ? { parkedFromStage: current.parkedFromStage } : {};
  const result = nextStage(current.stage, data.action, ctx);
  if (!result.ok) return problem(409, 'Illegal Transition', result.reason);

  return applyStageTransition(userId, id, current, data, result.stage, now);
}
