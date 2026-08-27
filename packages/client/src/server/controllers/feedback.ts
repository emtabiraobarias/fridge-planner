import 'server-only';
import mongoose from 'mongoose';
import { z } from 'zod';
import { FeedbackRecord } from '../models/feedback-record';
import { LifecycleItem } from '../models/lifecycle-item';
import { isTerminal } from '../lib/lifecycle-stages';
import { sendToFeedbackAgent } from '../services/feedback-collector';
import { renderFeedbackMarkdown } from '../lib/feedback-export';
import { FEEDBACK_STATUSES, type AgentReply, type IFeedbackMessage } from '../types/feedback';
import { record as auditRecord } from '../lib/audit';
import { problem, type ControllerResult } from '../http';

// Bound the transcript so token/latency growth is capped (FR-F-008). Counted in user turns.
const MAX_USER_TURNS = 30;

const messageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
});

const listQuerySchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
});

function invalidInput(error: z.ZodError): ControllerResult {
  return problem(400, 'Invalid input', error.issues.map((i) => i.message).join('; '));
}

function agentUnavailable(): ControllerResult {
  return problem(
    502,
    'Feedback Agent Unavailable',
    'The feedback assistant is temporarily unavailable. Your message was saved — please try again.',
  );
}

/** Copy a validated agent `record` onto the document and mark it complete. */
function applyComplete(
  doc: InstanceType<typeof FeedbackRecord>,
  reply: Extract<AgentReply, { status: 'complete' }>,
): void {
  const r = reply.record;
  doc.type = r.type;
  doc.title = r.title;
  doc.problemStatement = r.problemStatement;
  doc.userStory = r.userStory;
  doc.acceptanceCriteria = r.acceptanceCriteria;
  doc.reproSteps = r.reproSteps;
  doc.expectedBehavior = r.expectedBehavior;
  doc.actualBehavior = r.actualBehavior;
  doc.affectedArea = r.affectedArea;
  doc.priority = r.priority;
  doc.status = 'complete';
}

/**
 * Put a completed record into the triage queue at stage `new` (spec 012, research R2).
 *
 * FR-FL-001 says a *completed* report becomes a lifecycle item, and gate 1 then accepts it.
 * Creating it here rather than at acceptance is what gives the queue something to list — the
 * decision the queue exists to support cannot be the thing that makes it visible.
 *
 * Never throws: the reporter's record is saved and confirmed either way. A queue insert failing
 * must not turn a successful capture into an error for someone who just typed out a bug report.
 */
async function enqueueForTriage(doc: InstanceType<typeof FeedbackRecord>): Promise<void> {
  try {
    // The {userId, feedbackRecordId} unique index makes this idempotent in the DATABASE, so a
    // retried completion cannot queue the same report twice.
    await LifecycleItem.updateOne(
      { userId: doc.userId, feedbackRecordId: String(doc._id) },
      {
        $setOnInsert: {
          sourceTitle: doc.title ?? '(untitled)',
          sourceType: doc.type ?? 'improvement',
          sourceAffectedArea: doc.affectedArea ?? 'other',
          stage: 'new',
        },
      },
      { upsert: true },
    );
  } catch (err) {
    console.error('[feedback] could not enqueue for triage', { id: String(doc._id), err });
  }
}

function serialize(doc: InstanceType<typeof FeedbackRecord>): Record<string, unknown> {
  return doc.toObject() as unknown as Record<string, unknown>;
}

// POST /api/v1/feedback — start a new conversation.
export async function startConversation(userId: string, body: unknown): Promise<ControllerResult> {
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  // Persist the draft with the user's message BEFORE calling the agent, so nothing is
  // lost if the agent fails (FR-F-002).
  const now = new Date();
  const doc = new FeedbackRecord({
    userId,
    status: 'draft',
    transcript: [{ role: 'user', content: parsed.data.message, at: now }],
  });
  await doc.save();

  return runAgentTurn(doc);
}

// POST /api/v1/feedback/:id/messages — continue an existing conversation.
export async function continueConversation(
  userId: string,
  id: string,
  body: unknown,
): Promise<ControllerResult> {
  if (!mongoose.isValidObjectId(id))
    return problem(404, 'Not Found', 'Feedback conversation not found');

  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const doc = await FeedbackRecord.findOne({ _id: id, userId });
  if (!doc) return problem(404, 'Not Found', 'Feedback conversation not found');
  if (doc.status !== 'draft') {
    return problem(
      409,
      'Conversation Complete',
      'This conversation is already complete. Start a new one to add more feedback.',
    );
  }

  doc.transcript.push({ role: 'user', content: parsed.data.message, at: new Date() });
  await doc.save();

  return runAgentTurn(doc);
}

/**
 * Shared turn logic: call the agent with the current transcript, append its reply, and
 * either mark the record complete or leave it as a draft awaiting the next answer. On any
 * agent/validation failure the draft (incl. the just-saved user message) is preserved and
 * a 502 is returned (FR-F-004).
 */
async function runAgentTurn(doc: InstanceType<typeof FeedbackRecord>): Promise<ControllerResult> {
  const userTurns = doc.transcript.filter((m: IFeedbackMessage) => m.role === 'user').length;
  const finalize = userTurns >= MAX_USER_TURNS;

  let reply: AgentReply;
  try {
    reply = await sendToFeedbackAgent(doc.transcript, { finalize });
  } catch (err) {
    console.error('[feedback] agent turn failed', err);
    return agentUnavailable();
  }

  doc.transcript.push({ role: 'agent', content: reply.reply, at: new Date() });
  if (reply.status === 'complete') applyComplete(doc, reply);
  await doc.save();
  // Only once it is actually persisted as complete — the queue must never hold an item whose
  // record did not save (spec 012 FR-FL-001, research R2).
  if (doc.status === 'complete') await enqueueForTriage(doc);

  return {
    status: doc.status === 'complete' ? 200 : 201,
    body: { feedback: serialize(doc), status: doc.status, reply: reply.reply },
  };
}

// GET /api/v1/feedback — list the user's own records (lean, no transcript).
export async function listFeedback(
  userId: string,
  query: URLSearchParams,
): Promise<ControllerResult> {
  const parsed = listQuerySchema.safeParse({ status: query.get('status') ?? undefined });
  if (!parsed.success) return invalidInput(parsed.error);

  const filter: Record<string, unknown> = { userId };
  if (parsed.data.status) filter['status'] = parsed.data.status;

  const docs = await FeedbackRecord.find(filter)
    .select('-transcript')
    .sort({ updatedAt: -1 })
    .lean();

  return { status: 200, body: { feedback: docs } };
}

// GET /api/v1/feedback/:id — full record incl. transcript.
export async function getFeedback(userId: string, id: string): Promise<ControllerResult> {
  if (!mongoose.isValidObjectId(id))
    return problem(404, 'Not Found', 'Feedback conversation not found');
  const doc = await FeedbackRecord.findOne({ _id: id, userId });
  if (!doc) return problem(404, 'Not Found', 'Feedback conversation not found');
  return { status: 200, body: { feedback: serialize(doc) } };
}

// DELETE /api/v1/feedback/:id — remove the user's own record.
// Spec 003 dev-loop (EC-06, D9): a record with an ACTIVE (non-'parked') PipelineItem
// is protected from deletion; a record whose only PipelineItem is 'parked' cascades —
// both the record and the parked item are removed together, so no PipelineItem is
// ever left pointing at a deleted record.
export async function deleteFeedback(userId: string, id: string): Promise<ControllerResult> {
  if (!mongoose.isValidObjectId(id))
    return problem(404, 'Not Found', 'Feedback conversation not found');

  // FR-FL-006: refused while the item is in an ACTIVE stage. `parked` and the three terminal
  // stages are not active, so those cascade — updated from the old `!== 'parked'` check, which
  // predates closed/dismissed/merged existing and would have protected finished work forever.
  const item = await LifecycleItem.findOne({ userId, feedbackRecordId: id });
  if (item && item.stage !== 'parked' && !isTerminal(item.stage)) {
    return problem(
      409,
      'Pipeline Active',
      'This record is in the active development pipeline. Park it first.',
    );
  }

  const doc = await FeedbackRecord.findOneAndDelete({ _id: id, userId });
  if (!doc) return problem(404, 'Not Found', 'Feedback conversation not found');

  if (item) await LifecycleItem.deleteOne({ _id: item._id });

  return { status: 204, body: null };
}

// GET /api/v1/feedback/:id/export — spec-template markdown (FR-F-007).
export async function exportFeedback(userId: string, id: string): Promise<ControllerResult> {
  if (!mongoose.isValidObjectId(id))
    return problem(404, 'Not Found', 'Feedback conversation not found');
  const doc = await FeedbackRecord.findOne({ _id: id, userId });
  if (!doc) return problem(404, 'Not Found', 'Feedback conversation not found');
  if (doc.status === 'draft') {
    return problem(409, 'Conversation Incomplete', 'Finish the conversation before exporting it.');
  }
  // Spec 011 FR-AD-013/021: export produces a maintainer artifact and is
  // administrator-only, so it is an audited administrative action. `userId` here is
  // the acting administrator (the route resolves it via requirePrincipalAdmin).
  await auditRecord(userId, 'feedback.export', {
    userId: doc.userId,
    type: 'feedback',
    id: String(doc._id),
  });
  return { status: 200, body: renderFeedbackMarkdown(doc.toObject()) };
}
