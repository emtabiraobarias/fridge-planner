import 'server-only';
import { z } from 'zod';
import { LifecycleItem } from '../models/lifecycle-item';
import { FeedbackRecord } from '../models/feedback-record';
import { problem, type ControllerResult } from '../http';
import { record as auditRecord } from '../lib/audit';
import {
  isGateApproval,
  isTerminal,
  resolveReopen,
  resolveTransition,
  type LifecycleAction,
  type LifecycleStage,
} from '../lib/lifecycle-stages';
import {
  DISMISSAL_REASONS,
  type ILifecycleItem,
  type ITransitionLogEntry,
} from '../types/lifecycle';

/**
 * The lifecycle controller (spec 012). Every stage change goes through `applyAction`.
 *
 * Concurrency is handled by a single **atomic guarded `findOneAndUpdate`** whose filter pins the
 * stage the caller believed it was acting on. Two maintainers acting at once therefore cannot
 * both win: the second matches nothing and is refused as an illegal transition (FR-FL-004), which
 * is the honest answer — its view of the item was stale.
 */

export const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept') }),
  z.object({ action: z.literal('dismiss'), reason: z.enum(DISMISSAL_REASONS) }),
  z.object({ action: z.literal('merge'), targetId: z.string().min(1) }),
  z.object({ action: z.literal('advance') }),
  z.object({ action: z.literal('approve-spec') }),
  z.object({ action: z.literal('reject-spec'), note: z.string().max(2000).optional() }),
  z.object({ action: z.literal('approve-release') }),
  z.object({ action: z.literal('reject-release'), note: z.string().max(2000).optional() }),
  z.object({ action: z.literal('park'), note: z.string().max(2000).optional() }),
  z.object({ action: z.literal('reopen') }),
  z.object({ action: z.literal('set-rank'), rank: z.number().int().min(0) }),
  z.object({
    action: z.literal('edit-source'),
    sourceTitle: z.string().min(1).max(300).optional(),
    sourceAffectedArea: z.string().min(1).max(120).optional(),
  }),
]);
export type ActionRequest = z.infer<typeof actionSchema>;

const ILLEGAL = 'Illegal Transition';

/** `dismiss` and `accept` both mean "a maintainer has looked at this" (FR-FL-062/063). */
async function markSourceReviewed(item: Pick<ILifecycleItem, 'feedbackRecordId'>): Promise<void> {
  await FeedbackRecord.updateOne(
    { _id: item.feedbackRecordId, status: 'complete' },
    { $set: { status: 'reviewed' } },
  );
}

/**
 * Non-transition actions: they change the item without moving its stage, so they skip the
 * legality graph entirely rather than being modelled as self-transitions.
 */
type NonTransitionRequest = Extract<ActionRequest, { action: 'set-rank' | 'edit-source' }>;

async function applyNonTransition(
  id: string,
  adminUserId: string,
  body: NonTransitionRequest,
): Promise<ControllerResult> {
  if (body.action === 'set-rank') {
    const updated = await LifecycleItem.findOneAndUpdate(
      { _id: id },
      { $set: { rank: body.rank } },
      { new: true },
    ).lean();
    if (!updated) return problem(404, 'Not Found', 'No such lifecycle item.');
    await auditRecord(adminUserId, 'lifecycle.rank', { id, type: 'lifecycle' });
    return { status: 200, body: updated };
  }

  // edit-source — allowed only BEFORE the record briefs (FR-FL-020). After that, clauses have
  // been derived from the text, so editing it silently invalidates what was vetted.
  const current = await LifecycleItem.findById(id).lean();
  if (!current) return problem(404, 'Not Found', 'No such lifecycle item.');
  if (!['new', 'accepted'].includes(current.stage)) {
    return problem(409, ILLEGAL, 'A record can only be edited before it is briefed.');
  }

  const $set: Record<string, unknown> = {};
  if (body.sourceTitle !== undefined) $set['sourceTitle'] = body.sourceTitle;
  if (body.sourceAffectedArea !== undefined) $set['sourceAffectedArea'] = body.sourceAffectedArea;
  if (Object.keys($set).length === 0) {
    return problem(400, 'Invalid Request', 'Provide at least one field to edit.');
  }

  const updated = await LifecycleItem.findOneAndUpdate({ _id: id }, { $set }, { new: true }).lean();
  // Attributed, so an edited record shows whose words were changed (FR-FL-021).
  await auditRecord(adminUserId, 'lifecycle.edit', { id, type: 'lifecycle' });
  return { status: 200, body: updated! };
}


/**
 * The per-action field writes. Extracted from `applyAction` to keep it under the complexity
 * limit (CLAUDE.md §7) — the switch is inherently one branch per action, so it belongs on its
 * own rather than inflating the function that owns the atomic update.
 *
 * Returns a `ControllerResult` instead of the update when the action is invalid on its own
 * terms (a self-merge, a missing target), so the caller refuses before writing anything.
 */
async function buildStageUpdate(
  id: string,
  body: Exclude<ActionRequest, NonTransitionRequest>,
  from: LifecycleStage,
  to: LifecycleStage,
  adminUserId: string,
): Promise<{ $set: Record<string, unknown> } | ControllerResult> {
  const $set: Record<string, unknown> = { stage: to };

  switch (body.action) {
    case 'merge': {
      if (body.targetId === id) {
        return problem(400, 'Invalid Request', 'An item cannot be merged into itself.');
      }
      if (!(await LifecycleItem.exists({ _id: body.targetId }))) {
        return problem(404, 'Not Found', 'No such merge target.');
      }
      $set['mergedInto'] = body.targetId;
      break;
    }
    case 'dismiss':
      $set['dismissalReason'] = body.reason;
      break;
    case 'park':
      $set['parkedFromStage'] = from;
      break;
    case 'reopen':
      $set['parkedFromStage'] = undefined;
      break;
    case 'accept':
      $set['acceptedBy'] = adminUserId;
      $set['acceptedAt'] = new Date();
      break;
    default:
      break;
  }

  return { $set };
}


/**
 * Where this action leads, or the refusal that stops it.
 *
 * Split out of `applyAction` for the complexity limit, but it also isolates the one rule worth
 * reading on its own: a TERMINAL item is refused before any destination is computed, so `closed`
 * cannot be reached by an action that happens to resolve somewhere (FR-FL-049, D13).
 */
function resolveDestination(
  body: Exclude<ActionRequest, NonTransitionRequest>,
  current: LifecycleStage,
  parkedFromStage: LifecycleStage | undefined,
): { from: LifecycleStage; to: LifecycleStage } | ControllerResult {
  if (isTerminal(current)) {
    return problem(409, ILLEGAL, `A ${current} item cannot be changed.`);
  }

  const action: LifecycleAction = body.action;
  const to =
    action === 'reopen'
      ? resolveReopen(current, parkedFromStage)
      : resolveTransition(action, current);

  if (!to) return problem(409, ILLEGAL, `Cannot ${action} an item that is ${current}.`);
  return { from: current, to };
}


/** One append-only transition entry. */
function buildTransition(
  body: Exclude<ActionRequest, NonTransitionRequest>,
  from: LifecycleStage,
  to: LifecycleStage,
  adminUserId: string,
): ITransitionLogEntry {
  return {
    from,
    to,
    actor: 'human',
    actorUserId: adminUserId,
    at: new Date(),
    // Derived HERE, never taken from the request (FR-FL-013): a client that could assert
    // "this was a gate approval" could manufacture the evidence that `shipped` was authorised.
    isGateApproval: isGateApproval(body.action),
    ...('note' in body && typeof body.note === 'string' ? { note: body.note } : {}),
  };
}

/** Apply a maintainer action to one item. Every refusal leaves state unchanged. */
export async function applyAction(
  id: string,
  adminUserId: string,
  body: ActionRequest,
): Promise<ControllerResult> {
  if (body.action === 'set-rank' || body.action === 'edit-source') {
    return applyNonTransition(id, adminUserId, body);
  }

  const current = await LifecycleItem.findById(id).lean();
  if (!current) return problem(404, 'Not Found', 'No such lifecycle item.');

  const destination = resolveDestination(body, current.stage, current.parkedFromStage);
  if ('status' in destination) return destination;
  const { from, to } = destination;

  const built = await buildStageUpdate(id, body, from, to, adminUserId);
  if ('status' in built) return built;
  const { $set } = built;

  const transition = buildTransition(body, from, to, adminUserId);

  // The guard: `stage: from` pins the state the caller acted on, so a concurrent transition
  // matches nothing rather than overwriting (FR-FL-004).
  const updated = await LifecycleItem.findOneAndUpdate(
    { _id: id, stage: from },
    { $set, $push: { transitions: transition } },
    { new: true },
  ).lean();

  if (!updated) {
    return problem(409, ILLEGAL, 'The item changed while this action was in flight.');
  }

  if (body.action === 'accept' || body.action === 'dismiss') {
    await markSourceReviewed(updated);
  }

  // FR-FL-005 — actor and time, on the append-only trail. No transition commits, merges, tags
  // or deploys (FR-FL-057); this records that a human decided, nothing more.
  await auditRecord(adminUserId, 'lifecycle.transition', {
    id,
    type: 'lifecycle',
    userId: updated.userId,
  });

  return { status: 200, body: updated };
}
