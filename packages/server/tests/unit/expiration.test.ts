import { describe, it, expect } from '@jest/globals';
import {
  getExpirationStatus,
  expirationStatusQuery,
  notExpiredQuery,
} from '../../src/lib/expiration.js';

/**
 * Midnight cutoff rules (FR-006):
 *   expired      — expiresAt <= today's midnight (today or earlier)
 *   expiring-soon — expiresAt == tomorrow's midnight (exactly 1 day away)
 *   normal       — expiresAt >= day-after-tomorrow
 *   none         — no expiration date provided
 */

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

describe('getExpirationStatus', () => {
  it('returns "none" when no expiration date is provided', () => {
    expect(getExpirationStatus(undefined)).toBe('none');
  });

  it('returns "expired" for an item that expired yesterday', () => {
    expect(getExpirationStatus(daysFromNow(-1))).toBe('expired');
  });

  it('returns "expired" for an item expiring exactly at today midnight', () => {
    expect(getExpirationStatus(daysFromNow(0))).toBe('expired');
  });

  it('returns "expiring-soon" for an item expiring tomorrow', () => {
    expect(getExpirationStatus(daysFromNow(1))).toBe('expiring-soon');
  });

  it('returns "normal" for an item expiring the day after tomorrow', () => {
    expect(getExpirationStatus(daysFromNow(2))).toBe('normal');
  });

  it('returns "normal" for an item expiring far in the future', () => {
    expect(getExpirationStatus(daysFromNow(30))).toBe('normal');
  });
});

describe('expirationStatusQuery', () => {
  it('selects items before tomorrow midnight for "expired"', () => {
    const q = expirationStatusQuery('expired') as { expiresAt: { $lt: Date } };
    expect(q.expiresAt.$lt).toBeInstanceOf(Date);
  });

  it('selects exactly tomorrow for "expiring-soon" (lower < upper bound)', () => {
    const q = expirationStatusQuery('expiring-soon') as { expiresAt: { $gte: Date; $lt: Date } };
    expect(q.expiresAt.$gte.getTime()).toBeLessThan(q.expiresAt.$lt.getTime());
  });

  it('selects day-after-tomorrow onward for "normal"', () => {
    const q = expirationStatusQuery('normal') as { expiresAt: { $gte: Date } };
    expect(q.expiresAt.$gte).toBeInstanceOf(Date);
  });

  it('selects items with no expiry date for "none"', () => {
    expect(expirationStatusQuery('none')).toEqual({ expiresAt: null });
  });

  it('returns an empty filter for an unknown status', () => {
    expect(expirationStatusQuery('bogus')).toEqual({});
  });
});

describe('notExpiredQuery', () => {
  it('matches items with no expiry OR an expiry not yet reached', () => {
    const q = notExpiredQuery() as { $or: Array<Record<string, unknown>> };
    expect(q.$or).toHaveLength(2);
    expect(q.$or[0]).toEqual({ expiresAt: null });
    expect(q.$or[1]).toHaveProperty('expiresAt');
  });
});
