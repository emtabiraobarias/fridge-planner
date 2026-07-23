// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  nextStage,
  isGateAction,
  assertPromotable,
  STAGE_ORDINAL,
} from '@server/lib/pipeline-transitions';
import type { PipelineStage, TransitionAction } from '@server/types/pipeline';
import { PIPELINE_STAGES, TRANSITION_ACTIONS } from '@server/types/pipeline';

// Exhaustive from×action legality matrix per research.md D3's table (FR-F-013/014/016).
describe('nextStage — exhaustive legality matrix (D3)', () => {
  describe('advance', () => {
    it('is legal only approved -> in-spec', () => {
      const result = nextStage('approved', 'advance');
      expect(result).toEqual({ ok: true, stage: 'in-spec' });
    });

    it('errors from every other stage', () => {
      const others: PipelineStage[] = ['in-spec', 'in-review', 'shipped', 'parked'];
      for (const from of others) {
        const result = nextStage(from, 'advance');
        expect(result.ok).toBe(false);
      }
    });
  });

  describe('approve-spec', () => {
    it('is legal only in-spec -> in-review and is a gate action', () => {
      const result = nextStage('in-spec', 'approve-spec');
      expect(result).toEqual({ ok: true, stage: 'in-review' });
      expect(isGateAction('approve-spec')).toBe(true);
    });

    it('errors from every other stage', () => {
      const others: PipelineStage[] = ['approved', 'in-review', 'shipped', 'parked'];
      for (const from of others) {
        expect(nextStage(from, 'approve-spec').ok).toBe(false);
      }
    });
  });

  describe('approve-release', () => {
    it('is legal only in-review -> shipped and is a gate action', () => {
      const result = nextStage('in-review', 'approve-release');
      expect(result).toEqual({ ok: true, stage: 'shipped' });
      expect(isGateAction('approve-release')).toBe(true);
    });

    it('errors from every other stage', () => {
      const others: PipelineStage[] = ['approved', 'in-spec', 'shipped', 'parked'];
      for (const from of others) {
        expect(nextStage(from, 'approve-release').ok).toBe(false);
      }
    });
  });

  describe('park', () => {
    it('is legal from approved, in-spec, in-review -> parked', () => {
      const froms: PipelineStage[] = ['approved', 'in-spec', 'in-review'];
      for (const from of froms) {
        expect(nextStage(from, 'park')).toEqual({ ok: true, stage: 'parked' });
      }
    });

    it('is idempotent when already parked', () => {
      expect(nextStage('parked', 'park')).toEqual({ ok: true, stage: 'parked' });
    });

    it('is illegal from shipped', () => {
      expect(nextStage('shipped', 'park').ok).toBe(false);
    });
  });

  describe('reopen', () => {
    it('is legal only from parked, returning to the stored parkedFromStage', () => {
      const result = nextStage('parked', 'reopen', { parkedFromStage: 'in-review' });
      expect(result).toEqual({ ok: true, stage: 'in-review' });
    });

    it('defaults to approved when no parkedFromStage was recorded', () => {
      const result = nextStage('parked', 'reopen');
      expect(result).toEqual({ ok: true, stage: 'approved' });
    });

    it('errors from every non-parked stage', () => {
      const others: PipelineStage[] = ['approved', 'in-spec', 'in-review', 'shipped'];
      for (const from of others) {
        expect(nextStage(from, 'reopen').ok).toBe(false);
      }
    });
  });

  describe('backward and multi-step jumps', () => {
    const illegalJumps: Array<[PipelineStage, TransitionAction]> = [
      ['in-review', 'advance'], // gated — advance never valid past approved
      ['shipped', 'advance'],
      ['in-spec', 'advance'], // gated — must use approve-spec
    ];

    it.each(illegalJumps)('errors for %s -> (%s)', (from, action) => {
      expect(nextStage(from, action).ok).toBe(false);
    });
  });

  describe('every action is defined for every stage (no crash, structured result only)', () => {
    it.each(PIPELINE_STAGES)('stage %s', (stage) => {
      for (const action of TRANSITION_ACTIONS) {
        if (action === 'attach-artifact') continue; // handled by the controller, not the state machine
        expect(() => nextStage(stage, action, { parkedFromStage: 'approved' })).not.toThrow();
      }
    });
  });
});

describe('isGateAction', () => {
  it('is true only for approve-spec and approve-release', () => {
    expect(isGateAction('approve-spec')).toBe(true);
    expect(isGateAction('approve-release')).toBe(true);
    expect(isGateAction('advance')).toBe(false);
    expect(isGateAction('park')).toBe(false);
    expect(isGateAction('reopen')).toBe(false);
    expect(isGateAction('attach-artifact')).toBe(false);
  });
});

describe('STAGE_ORDINAL', () => {
  it('orders the four active stages forward', () => {
    expect(STAGE_ORDINAL['approved']).toBe(0);
    expect(STAGE_ORDINAL['in-spec']).toBe(1);
    expect(STAGE_ORDINAL['in-review']).toBe(2);
    expect(STAGE_ORDINAL['shipped']).toBe(3);
  });
});

describe('assertPromotable (FR-F-013/016)', () => {
  it('is true only when record.status === "complete"', () => {
    expect(assertPromotable({ status: 'complete' })).toBe(true);
    expect(assertPromotable({ status: 'draft' })).toBe(false);
    expect(assertPromotable({ status: 'reviewed' })).toBe(false);
  });
});
