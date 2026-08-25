import 'server-only';
import { z } from 'zod';
import { LifecycleItem } from '../models/lifecycle-item';
import { FeedbackRecord } from '../models/feedback-record';
import { draftClauses } from '../services/feedback-collector';
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
  ARTIFACT_TYPES,
  DISMISSAL_REASONS,
  type IClosureRecord,
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
  z.object({
    action: z.literal('close'),
    excerpt: z.string().min(1).max(2000),
    releaseTag: z.string().max(200).optional(),
    releaseUrl: z.string().max(2048).optional(),
    releaseFallbackText: z.string().max(500).optional(),
    unavailableReason: z.string().max(500).optional(),
  }),
  z.object({ action: z.literal('cite'), citedId: z.string().min(1) }),
  z.object({
    action: z.literal('attach-artifact'),
    artifact: z.object({
      type: z.enum(ARTIFACT_TYPES),
      // A reference ONLY. Never fetched, never dereferenced, never executed (FR-FL-057).
      ref: z.string().min(1).max(2048),
      note: z.string().max(500).optional(),
    }),
  }),
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
type NonTransitionRequest = Extract<
  ActionRequest,
  { action: 'set-rank' | 'edit-source' | 'cite' | 'attach-artifact' }
>;

/**
 * The non-transition actions that are one Mongo update and nothing else.
 *
 * Tabled rather than chained: each is two lines of intent and one of plumbing, and as a
 * branch-per-action they pushed `applyNonTransition` past the complexity limit.
 */
function simpleUpdateFor(body: NonTransitionRequest): Record<string, unknown> | null {
  switch (body.action) {
    case 'attach-artifact':
      // Records where the work HAPPENED, which a human did elsewhere. Stored as a string and
      // never dereferenced: no action may commit, merge, tag or deploy (FR-FL-057).
      return { $push: { artifacts: { ...body.artifact, at: new Date() } } };
    case 'cite':
      // A reference, never a transition (FR-FL-050/051) — and the only way a recurrence relates
      // to a `closed` item, so it must work on a terminal one.
      return { $addToSet: { cites: body.citedId } };
    case 'set-rank':
      return { $set: { rank: body.rank } };
    default:
      return null;
  }
}

async function applyNonTransition(
  id: string,
  adminUserId: string,
  body: NonTransitionRequest,
): Promise<ControllerResult> {
  const simple = simpleUpdateFor(body);
  if (simple) {
    const updated = await LifecycleItem.findOneAndUpdate({ _id: id }, simple, {
      new: true,
    }).lean();
    if (!updated) return problem(404, 'Not Found', 'No such lifecycle item.');
    const action = body.action === 'set-rank' ? 'lifecycle.rank' : 'lifecycle.edit';
    await auditRecord(adminUserId, action, { id, type: 'lifecycle' });
    return { status: 200, body: updated };
  }

  // Everything not handled above is `edit-source`. Stated as a guard rather than assumed, so
  // adding a non-transition action later fails here instead of falling into the wrong branch.
  if (body.action !== 'edit-source') {
    return problem(400, 'Invalid Request', 'Unrecognised action.');
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
 * The closure record. Carries either a picked release or the free-text fallback — the fallback
 * is a FIRST-CLASS path, not an error state, because `FR-FL-045` forbids gating closure on a
 * third party. `unavailableReason` records WHY the picker was empty, so a closure written during
 * an outage is not indistinguishable from a careless one.
 */
function buildClosure(
  body: Extract<ActionRequest, { action: 'close' }>,
  adminUserId: string,
): IClosureRecord {
  return {
    excerpt: body.excerpt,
    ...(body.releaseTag ? { releaseTag: body.releaseTag } : {}),
    ...(body.releaseUrl ? { releaseUrl: body.releaseUrl } : {}),
    ...(body.releaseFallbackText ? { releaseFallbackText: body.releaseFallbackText } : {}),
    ...(body.unavailableReason ? { unavailableReason: body.unavailableReason } : {}),
    closedBy: adminUserId,
    closedAt: new Date(),
  };
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
    case 'close':
      $set['closure'] = buildClosure(body, adminUserId);
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


/**
 * FR-FL-028 / SC-FL-005 — nothing reaches `in-spec` on unvetted clauses.
 *
 * Checked here rather than in the stage graph because it depends on the item's CONTENT, not on
 * the stage pair: the same transition is legal or not depending on what has been vetted.
 */
function refuseIfUnvetted(
  from: LifecycleStage,
  to: LifecycleStage,
  clauses: readonly { vetted: string }[],
): ControllerResult | null {
  if (from !== 'briefed' || to !== 'in-spec') return null;
  const pending = clauses.filter((c) => c.vetted === 'pending').length;
  if (pending === 0) return null;
  return problem(409, ILLEGAL, `${pending} clause(s) still need vetting before this can go to spec.`);
}


/**
 * Everything that can refuse a transition BEFORE anything is written: the item must exist, the
 * destination must be legal, and `briefed → in-spec` must not carry unvetted clauses.
 *
 * Grouped so `applyAction` reads as resolve → write → record rather than as a run of guards.
 */
async function preflight(
  id: string,
  body: Exclude<ActionRequest, NonTransitionRequest>,
): Promise<{ from: LifecycleStage; to: LifecycleStage } | ControllerResult> {
  const current = await LifecycleItem.findById(id).lean();
  if (!current) return problem(404, 'Not Found', 'No such lifecycle item.');

  const destination = resolveDestination(body, current.stage, current.parkedFromStage);
  if ('status' in destination) return destination;

  return refuseIfUnvetted(destination.from, destination.to, current.clauses) ?? destination;
}

/** Apply a maintainer action to one item. Every refusal leaves state unchanged. */
export async function applyAction(
  id: string,
  adminUserId: string,
  body: ActionRequest,
): Promise<ControllerResult> {
  if (
    body.action === 'set-rank' ||
    body.action === 'edit-source' ||
    body.action === 'cite' ||
    body.action === 'attach-artifact'
  ) {
    return applyNonTransition(id, adminUserId, body);
  }

  const checked = await preflight(id, body);
  if ('status' in checked) return checked;
  const { from, to } = checked;

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


// ─── Reporter-facing reads (US2) ──────────────────────────────────────────────

export interface ReporterView {
  _id: string;
  sourceTitle: string;
  stage: LifecycleStage;
  stageLabel: string;
  dismissalReason?: string;
  reply?: { text: string; at: Date };
  closure?: { excerpt: string; releaseTag?: string; releaseUrl?: string };
  mergedTargetStage?: LifecycleStage;
  updatedAt: Date;
}

/** Reporter-facing stage vocabulary (FR-FL-035). "Being specified" vs "being built" is the
 *  distinction D12 buys the reporter — it is the difference they actually feel. */
const REPORTER_LABEL: Record<LifecycleStage, string> = {
  new: 'Received',
  accepted: 'Accepted',
  briefed: 'Being specified',
  'in-spec': 'Being specified',
  'in-progress': 'Being built',
  'in-review': 'In review',
  shipped: 'Shipped',
  closed: 'Closed',
  dismissed: 'Not being built',
  merged: 'Merged with another report',
  parked: 'Paused',
};

/**
 * Project one item for its reporter.
 *
 * A PROJECTION, never a client-side filter (research R5). The cheapest way to violate D1's
 * reporter isolation is to send the whole document and hide fields in the UI, so a merged item
 * resolves its target's stage HERE and the target document never leaves the process.
 */
async function toReporterView(item: ILifecycleItem & { _id: unknown }): Promise<ReporterView> {
  const view: ReporterView = {
    _id: String(item._id),
    sourceTitle: item.sourceTitle,
    stage: item.stage,
    stageLabel: REPORTER_LABEL[item.stage],
    updatedAt: item.updatedAt,
    // The reason IS the closing of the loop for declined work (FR-FL-065). Without it a
    // reporter sees only "not being built" and learns nothing.
    ...(item.dismissalReason ? { dismissalReason: item.dismissalReason } : {}),
    ...(item.reply ? { reply: { text: item.reply.text, at: item.reply.at } } : {}),
    ...(item.closure
      ? {
          closure: {
            excerpt: item.closure.excerpt,
            ...(item.closure.releaseTag ? { releaseTag: item.closure.releaseTag } : {}),
            ...(item.closure.releaseUrl ? { releaseUrl: item.closure.releaseUrl } : {}),
          },
        }
      : {}),
  };

  if (item.stage === 'merged' && item.mergedInto) {
    const target = await LifecycleItem.findById(item.mergedInto).select('stage').lean();
    // Stage ONLY — no id, title, text or reporter (FR-FL-019, D14).
    if (target) view.mergedTargetStage = target.stage;
  }

  return view;
}

/** GET /lifecycle — the caller's OWN items, never anyone else's (FR-FL-034/038). */
export async function listOwn(userId: string): Promise<ControllerResult> {
  const items = await LifecycleItem.find({ userId }).sort({ updatedAt: -1 }).lean();
  return { status: 200, body: { items: await Promise.all(items.map(toReporterView)) } };
}

/** GET /lifecycle/:id — 404 for another reporter's item, so existence is not disclosed. */
export async function getOwn(userId: string, id: string): Promise<ControllerResult> {
  const item = await LifecycleItem.findOne({ _id: id, userId }).lean();
  if (!item) return problem(404, 'Not Found', 'No such item.');
  return { status: 200, body: await toReporterView(item) };
}

/** PUT /admin/lifecycle/:id/reply — the maintainer writes to the reporter (FR-FL-036). */
export async function setReply(
  id: string,
  adminUserId: string,
  text: string,
): Promise<ControllerResult> {
  const updated = await LifecycleItem.findOneAndUpdate(
    { _id: id },
    { $set: { reply: { text, byUserId: adminUserId, at: new Date() } } },
    { new: true },
  ).lean();
  if (!updated) return problem(404, 'Not Found', 'No such lifecycle item.');
  await auditRecord(adminUserId, 'lifecycle.edit', { id, type: 'lifecycle' });
  return { status: 200, body: { ok: true } };
}


// ─── Clauses (US3) ────────────────────────────────────────────────────────────

/**
 * Draft clauses for an item at `briefed` (FR-FL-024).
 *
 * Drafting is an ASSIST, never a precondition: if the agent returns nothing the item still sits
 * at `briefed` and the maintainer writes the clauses by hand (FR-FL-031). Existing clauses are
 * never overwritten — vetting work must not be lost to a re-draft.
 */
export async function draftClausesFor(id: string, adminUserId: string): Promise<ControllerResult> {
  const item = await LifecycleItem.findById(id).lean();
  if (!item) return problem(404, 'Not Found', 'No such lifecycle item.');
  if (item.stage !== 'briefed') {
    return problem(409, ILLEGAL, 'Clauses are drafted at the briefed stage.');
  }

  const record = await FeedbackRecord.findById(item.feedbackRecordId).lean();
  if (!record) return problem(404, 'Not Found', 'The source record is gone.');

  const drafted = await draftClauses({
    ...(record.title ? { title: record.title } : {}),
    ...(record.problemStatement ? { problemStatement: record.problemStatement } : {}),
    ...(record.acceptanceCriteria ? { acceptanceCriteria: record.acceptanceCriteria } : {}),
  });

  // Provisional ids only — nothing unvetted may wear a real `FR-` number (FR-FL-027).
  const existing = item.clauses.length;
  const clauses = drafted.map((d, i) => ({
    provisionalId: `C-${String(existing + i + 1).padStart(2, '0')}`,
    text: d.text,
    derivedFrom: d.derivedFrom,
    inferred: d.inferred,
    vetted: 'pending' as const,
  }));

  const updated = await LifecycleItem.findOneAndUpdate(
    { _id: id },
    { $push: { clauses: { $each: clauses } } },
    { new: true },
  ).lean();

  await auditRecord(adminUserId, 'lifecycle.edit', { id, type: 'lifecycle' });
  return { status: 200, body: { clauses: updated!.clauses, drafted: clauses.length } };
}

export const vetSchema = z.object({
  vetted: z.enum(['accepted', 'rejected']),
  editedText: z.string().min(1).max(600).optional(),
});

/** Vet one clause (FR-FL-029). A rejected clause stays visible — it is part of the record. */
export async function vetClause(
  id: string,
  provisionalId: string,
  adminUserId: string,
  body: z.infer<typeof vetSchema>,
): Promise<ControllerResult> {
  const updated = await LifecycleItem.findOneAndUpdate(
    { _id: id, 'clauses.provisionalId': provisionalId },
    {
      $set: {
        'clauses.$.vetted': body.vetted,
        'clauses.$.vettedBy': adminUserId,
        'clauses.$.vettedAt': new Date(),
        ...(body.editedText ? { 'clauses.$.editedText': body.editedText } : {}),
      },
    },
    { new: true },
  ).lean();

  if (!updated) return problem(404, 'Not Found', 'No such clause on that item.');
  await auditRecord(adminUserId, 'lifecycle.edit', { id, type: 'lifecycle' });
  return { status: 200, body: { clauses: updated.clauses } };
}

export const manualClauseSchema = z.object({
  text: z.string().min(1).max(600),
  derivedFrom: z.string().min(1).max(2000),
});

/**
 * Author a clause by hand (FR-FL-031).
 *
 * Recorded as already `accepted`: the maintainer wrote it, so there is nothing to vet it
 * against — vetting exists to check the AGENT's derivation, not the human's own words.
 */
export async function addManualClause(
  id: string,
  adminUserId: string,
  body: z.infer<typeof manualClauseSchema>,
): Promise<ControllerResult> {
  const item = await LifecycleItem.findById(id).lean();
  if (!item) return problem(404, 'Not Found', 'No such lifecycle item.');

  const clause = {
    provisionalId: `C-${String(item.clauses.length + 1).padStart(2, '0')}`,
    text: body.text,
    derivedFrom: body.derivedFrom,
    inferred: false,
    vetted: 'accepted' as const,
    vettedBy: adminUserId,
    vettedAt: new Date(),
  };

  const updated = await LifecycleItem.findOneAndUpdate(
    { _id: id },
    { $push: { clauses: clause } },
    { new: true },
  ).lean();

  await auditRecord(adminUserId, 'lifecycle.edit', { id, type: 'lifecycle' });
  return { status: 200, body: { clauses: updated!.clauses } };
}
