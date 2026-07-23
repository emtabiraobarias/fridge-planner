import 'server-only';
import { STAGE_ORDINAL, type PipelineStage, type TransitionAction } from '../types/pipeline';

// Pure state machine (D3/D5) — no HTTP, no DB. The legality matrix is where the
// correctness risk concentrates (SC-F-008), so it is exhaustively unit-tested in
// tests/server/unit/pipeline-transitions.test.ts independent of Mongo/Next.

export { STAGE_ORDINAL };

export interface TransitionError {
  ok: false;
  reason: string;
}

export interface TransitionOk {
  ok: true;
  stage: PipelineStage;
}

export type TransitionResult = TransitionOk | TransitionError;

interface TransitionContext {
  parkedFromStage?: PipelineStage;
}

function err(reason: string): TransitionError {
  return { ok: false, reason };
}

function ok(stage: PipelineStage): TransitionOk {
  return { ok: true, stage };
}

/** Gate actions are the only paths past `in-spec` and into `shipped` (D3, FR-F-016). */
export function isGateAction(action: TransitionAction): boolean {
  return action === 'approve-spec' || action === 'approve-release';
}

// Table-driven legal single-step forward transitions (D3). `reopen` (dynamic
// destination) and `attach-artifact` (no stage change) are handled separately below.
const TRANSITION_TABLE: Partial<Record<TransitionAction, Partial<Record<PipelineStage, PipelineStage>>>> = {
  advance: { approved: 'in-spec' },
  'approve-spec': { 'in-spec': 'in-review' },
  'approve-release': { 'in-review': 'shipped' },
  park: { approved: 'parked', 'in-spec': 'parked', 'in-review': 'parked', parked: 'parked' },
};

function transitionErrorMessage(current: PipelineStage, action: TransitionAction): string {
  if (action === 'advance' && (current === 'in-spec' || current === 'in-review')) {
    return 'Gated transition — use approve-spec/approve-release';
  }
  return `${action} is not valid from ${current}`;
}

/**
 * Compute the next stage for a `(current, action)` pair, or a structured error.
 * Table-driven per research.md D3 — single-step forward only, except explicit
 * park/reopen. Never mutates; the controller composes this with the atomic guarded
 * DB write (spec 007 precedent).
 */
export function nextStage(
  current: PipelineStage,
  action: TransitionAction,
  ctx: TransitionContext = {},
): TransitionResult {
  if (action === 'attach-artifact') {
    // No stage change — handled by the controller as an annotation, not a transition.
    return ok(current);
  }
  if (action === 'reopen') {
    if (current !== 'parked') return err(transitionErrorMessage(current, action));
    return ok(ctx.parkedFromStage ?? 'approved');
  }

  const to = TRANSITION_TABLE[action]?.[current];
  if (!to) return err(transitionErrorMessage(current, action));
  return ok(to);
}

/** Only `complete` records may be promoted (FR-F-013) — a `complete` record has
 * already passed `structuredRecordSchema` at save time (data-model.md). */
export function assertPromotable(record: { status: string }): boolean {
  return record.status === 'complete';
}
