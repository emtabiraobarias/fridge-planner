import 'server-only';

/**
 * The lifecycle stage graph (spec 012) — the SINGLE source of truth for what may follow what.
 *
 * Both the controller and the tests read this map. A legality matrix duplicated between code and
 * test only proves that someone typed it twice; asserting the shipped table is what makes
 * `FR-FL-003` ("refuse anything not legal from the current stage") testable at all.
 *
 * Supersedes `types/pipeline.ts`'s five-stage `PIPELINE_STAGES`. The collection is unchanged
 * (research R1) — only `approved` was renamed, to `accepted`, by
 * `scripts/migrate-lifecycle-stages.mjs`.
 */

export const LIFECYCLE_STAGES = [
  'new',
  'accepted',
  'briefed',
  'in-spec',
  'in-progress',
  'in-review',
  'shipped',
  'closed',
  'dismissed',
  'merged',
  'parked',
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/**
 * Stages nothing leaves. `closed` is terminal *without exception* (FR-FL-049, D13): a problem
 * that turns out to be wrongly fixed becomes a NEW report that **cites** the closed one, so each
 * record describes exactly one round of work.
 */
export const TERMINAL_STAGES = ['closed', 'dismissed', 'merged'] as const;
export type TerminalStage = (typeof TERMINAL_STAGES)[number];

export const LIFECYCLE_ACTIONS = [
  'accept',
  'dismiss',
  'merge',
  'advance',
  'approve-spec',
  'reject-spec',
  'approve-release',
  'reject-release',
  'close',
  'park',
  'reopen',
  'set-rank',
  'edit-source',
  'attach-artifact',
  'cite',
] as const;
export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

/**
 * The three human gates (D5). Derived on the SERVER and never taken from the request
 * (FR-FL-013) — a client that could assert "this was a gate approval" could manufacture the
 * evidence that `shipped` was authorised.
 */
export const GATE_ACTIONS = ['accept', 'approve-spec', 'approve-release'] as const;
export type GateAction = (typeof GATE_ACTIONS)[number];

/** Stages an item can be parked from and reopened back into — everything non-terminal. */
const ACTIVE_STAGES = LIFECYCLE_STAGES.filter(
  (s): s is Exclude<LifecycleStage, TerminalStage | 'parked'> =>
    s !== 'parked' && !(TERMINAL_STAGES as readonly string[]).includes(s),
);

/**
 * `action → { from → to }`. Absence means "not legal", which is how every refusal in
 * `FR-FL-003` is expressed; there is no separate deny-list to keep in step.
 */
const TRANSITIONS: Readonly<
  Partial<Record<LifecycleAction, Partial<Record<LifecycleStage, LifecycleStage>>>>
> = {
  accept: { new: 'accepted' },
  dismiss: { new: 'dismissed', accepted: 'dismissed' },
  merge: { new: 'merged', accepted: 'merged' },
  advance: { accepted: 'briefed', briefed: 'in-spec', 'in-progress': 'in-review' },
  'approve-spec': { 'in-spec': 'in-progress' },
  // Rejection returns to the WORK, never to the reporter (FR-FL-014 / FR-FL-064).
  'reject-spec': { 'in-spec': 'briefed' },
  'approve-release': { 'in-review': 'shipped' },
  'reject-release': { 'in-review': 'in-progress' },
  close: { shipped: 'closed' },
  park: Object.fromEntries(ACTIVE_STAGES.map((s) => [s, 'parked' as LifecycleStage])),
};

export function isTerminal(stage: LifecycleStage): boolean {
  return (TERMINAL_STAGES as readonly string[]).includes(stage);
}

export function isGateApproval(action: LifecycleAction): boolean {
  return (GATE_ACTIONS as readonly string[]).includes(action);
}

/**
 * The stage `action` leads to from `from`, or `null` if it is not legal.
 *
 * `reopen` always returns `null`: its destination is the item's stored `parkedFromStage`, which
 * only the caller holds. The graph refuses to invent a destination rather than guessing one —
 * an item reopened into the wrong stage would silently skip a gate.
 */
export function resolveTransition(
  action: LifecycleAction,
  from: LifecycleStage,
): LifecycleStage | null {
  return TRANSITIONS[action]?.[from] ?? null;
}

/** Where a parked item returns to, or `null` if it is not parked or has no recorded origin. */
export function resolveReopen(
  from: LifecycleStage,
  parkedFromStage: LifecycleStage | undefined,
): LifecycleStage | null {
  if (from !== 'parked' || !parkedFromStage) return null;
  if (isTerminal(parkedFromStage) || parkedFromStage === 'parked') return null;
  return parkedFromStage;
}
