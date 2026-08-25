// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  LIFECYCLE_STAGES,
  TERMINAL_STAGES,
  GATE_ACTIONS,
  isTerminal,
  isGateApproval,
  resolveTransition,
  type LifecycleStage,
  type LifecycleAction,
} from '@server/lib/lifecycle-stages';

/**
 * The stage graph is the single source of truth every story reads (plan Phase A), so this
 * asserts the WHOLE legality matrix rather than a handful of happy paths.
 *
 * The table is built at MODULE SCOPE deliberately: `it.each` expands at collection time, so a
 * matrix assembled in `beforeAll` registers zero cases and the suite passes by doing nothing
 * (CLAUDE.md §8).
 */

/** Every legal (action, from) → to, transcribed from data-model.md's matrix. */
const LEGAL: ReadonlyArray<[LifecycleAction, LifecycleStage, LifecycleStage]> = [
  ['accept', 'new', 'accepted'],
  ['dismiss', 'new', 'dismissed'],
  ['dismiss', 'accepted', 'dismissed'],
  ['merge', 'new', 'merged'],
  ['merge', 'accepted', 'merged'],
  ['advance', 'accepted', 'briefed'],
  ['advance', 'briefed', 'in-spec'],
  ['advance', 'in-progress', 'in-review'],
  ['approve-spec', 'in-spec', 'in-progress'],
  ['reject-spec', 'in-spec', 'briefed'],
  ['approve-release', 'in-review', 'shipped'],
  ['reject-release', 'in-review', 'in-progress'],
  ['close', 'shipped', 'closed'],
  ['park', 'new', 'parked'],
  ['park', 'accepted', 'parked'],
  ['park', 'briefed', 'parked'],
  ['park', 'in-spec', 'parked'],
  ['park', 'in-progress', 'parked'],
  ['park', 'in-review', 'parked'],
  ['park', 'shipped', 'parked'],
];

/** Actions that move an item, for exhaustive illegal-pair generation. */
const MOVING_ACTIONS: readonly LifecycleAction[] = [
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
];

const legalKeys = new Set(LEGAL.map(([a, f]) => `${a}:${f}`));

/** Every (action, from) pair the matrix does NOT permit. */
const ILLEGAL: ReadonlyArray<[LifecycleAction, LifecycleStage]> = MOVING_ACTIONS.flatMap((a) =>
  LIFECYCLE_STAGES.filter((f) => !legalKeys.has(`${a}:${f}`)).map(
    (f) => [a, f] as [LifecycleAction, LifecycleStage],
  ),
);

describe('lifecycle stage graph', () => {
  it('defines exactly the eleven stages the spec names (FR-FL-001)', () => {
    expect([...LIFECYCLE_STAGES].sort()).toEqual(
      [
        'accepted',
        'briefed',
        'closed',
        'dismissed',
        'in-progress',
        'in-review',
        'in-spec',
        'merged',
        'new',
        'parked',
        'shipped',
      ].sort(),
    );
    expect(LIFECYCLE_STAGES).toHaveLength(11);
  });

  it('treats closed, dismissed and merged as terminal (FR-FL-002)', () => {
    expect([...TERMINAL_STAGES].sort()).toEqual(['closed', 'dismissed', 'merged']);
  });

  it.each(TERMINAL_STAGES)('reports %s as terminal (FR-FL-002)', (stage) => {
    expect(isTerminal(stage)).toBe(true);
  });

  it.each(LEGAL)('permits %s from %s → %s', (action, from, to) => {
    expect(resolveTransition(action, from)).toBe(to);
  });

  it.each(ILLEGAL)('refuses %s from %s (FR-FL-003)', (action, from) => {
    expect(resolveTransition(action, from)).toBeNull();
  });

  // The single most important property: `closed` never reopens (FR-FL-049, D13). A recurrence
  // is a NEW report that cites the closed one — a reference, never a transition.
  it.each(MOVING_ACTIONS)('refuses %s out of closed — closed never reopens (FR-FL-049)', (a) => {
    expect(resolveTransition(a, 'closed')).toBeNull();
  });

  it.each(MOVING_ACTIONS)('refuses %s out of dismissed (FR-FL-002)', (a) => {
    expect(resolveTransition(a, 'dismissed')).toBeNull();
  });

  it.each(MOVING_ACTIONS)('refuses %s out of merged (FR-FL-002)', (a) => {
    expect(resolveTransition(a, 'merged')).toBeNull();
  });

  it('marks exactly the three gate approvals, server-derived (FR-FL-012/013)', () => {
    expect([...GATE_ACTIONS].sort()).toEqual(['accept', 'approve-release', 'approve-spec']);
  });

  it.each(GATE_ACTIONS)('flags %s as a gate approval (FR-FL-012)', (a) => {
    expect(isGateApproval(a)).toBe(true);
  });

  it.each(['advance', 'park', 'reopen', 'reject-spec', 'reject-release'] as LifecycleAction[])(
    'does not flag %s as a gate approval (FR-FL-013)',
    (a) => {
      expect(isGateApproval(a)).toBe(false);
    },
  );

  // FR-FL-014 and FR-FL-064: rejection returns to the WORK, never to the reporter.
  it('sends a rejected spec back to briefed, not to the reporter (FR-FL-014)', () => {
    expect(resolveTransition('reject-spec', 'in-spec')).toBe('briefed');
  });

  it('sends a rejected release back to in-progress — "changes needed" (FR-FL-064)', () => {
    expect(resolveTransition('reject-release', 'in-review')).toBe('in-progress');
  });

  // FR-FL-007: no implicit backward movement. `reopen` is resolved against the stored
  // parkedFromStage by the caller, so the graph itself never invents a destination.
  it('cannot resolve reopen without the stage it was parked from (FR-FL-007)', () => {
    expect(resolveTransition('reopen', 'parked')).toBeNull();
  });

  it('refuses reopen from anything that is not parked (FR-FL-003)', () => {
    for (const s of LIFECYCLE_STAGES.filter((x) => x !== 'parked')) {
      expect(resolveTransition('reopen', s)).toBeNull();
    }
  });
});
