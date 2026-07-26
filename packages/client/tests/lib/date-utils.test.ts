import { describe, it, expect, afterEach, vi } from 'vitest';
import { getWeekStart, getWeekDays, formatDayLabel, todayUtcDate } from '../../src/lib/date-utils';

// Helper: parse the ISO string returned and get the day of week (0=Sun,1=Mon,...)
function dayOfWeek(iso: string): number {
  return new Date(iso).getUTCDay();
}

describe('getWeekStart', () => {
  it('returns a Monday (day=1) for offset 0', () => {
    const result = getWeekStart(0);
    expect(dayOfWeek(result)).toBe(1);
  });

  it('returns a Monday for offset 1', () => {
    const result = getWeekStart(1);
    expect(dayOfWeek(result)).toBe(1);
  });

  it('returns a Monday for offset -1', () => {
    const result = getWeekStart(-1);
    expect(dayOfWeek(result)).toBe(1);
  });

  it('week+1 is exactly 7 days after week+0', () => {
    const w0 = new Date(getWeekStart(0)).getTime();
    const w1 = new Date(getWeekStart(1)).getTime();
    expect(w1 - w0).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('week-1 is exactly 7 days before week+0', () => {
    const w0 = new Date(getWeekStart(0)).getTime();
    const wm1 = new Date(getWeekStart(-1)).getTime();
    expect(w0 - wm1).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('defaults offset to 0 when called with no arguments', () => {
    expect(getWeekStart()).toBe(getWeekStart(0));
  });
});

describe('getWeekDays', () => {
  it('returns exactly 7 ISO date strings', () => {
    const days = getWeekDays(getWeekStart(0));
    expect(days).toHaveLength(7);
  });

  it('first day is Monday', () => {
    const days = getWeekDays(getWeekStart(0));
    expect(dayOfWeek(days[0])).toBe(1);
  });

  it('last day is Sunday', () => {
    const days = getWeekDays(getWeekStart(0));
    expect(dayOfWeek(days[6])).toBe(0);
  });

  it('days are consecutive (each 1 day apart)', () => {
    const days = getWeekDays(getWeekStart(0));
    for (let i = 1; i < 7; i++) {
      const diff = new Date(days[i]).getTime() - new Date(days[i - 1]).getTime();
      expect(diff).toBe(24 * 60 * 60 * 1000);
    }
  });

  it('first day matches the weekStart passed in', () => {
    const ws = getWeekStart(0);
    const days = getWeekDays(ws);
    expect(days[0]).toBe(ws);
  });
});

describe('formatDayLabel', () => {
  it('formats a known Monday correctly', () => {
    // 2026-04-06 is a Monday
    const label = formatDayLabel('2026-04-06T00:00:00.000Z');
    expect(label).toMatch(/Mon/);
    expect(label).toMatch(/6/);
    expect(label).toMatch(/Apr/);
  });

  it('formats a Sunday correctly', () => {
    // 2026-04-12 is a Sunday
    const label = formatDayLabel('2026-04-12T00:00:00.000Z');
    expect(label).toMatch(/Sun/);
    expect(label).toMatch(/12/);
    expect(label).toMatch(/Apr/);
  });
});

describe('todayUtcDate (spec 010 FR-RS-012 — the calendar\'s notion of "today")', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the LOCAL calendar day, not the UTC date, in a positive-offset timezone', () => {
    // 09:22 on Sun 26 Jul 2026 in AEST (+10) is still Sat 25 Jul in UTC. The user's
    // day is the 26th, so that is the day the calendar must treat as today —
    // `toISOString().slice(0,10)` would wrongly answer '2026-07-25' and land the day
    // strip on yesterday.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T23:22:00Z')); // = 2026-07-26 09:22 AEST
    const local = new Date();
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(
      local.getDate(),
    ).padStart(2, '0')}`;
    expect(todayUtcDate()).toBe(expected);
  });

  it('returns a UTC-midnight-anchored YYYY-MM-DD key that matches the meal-plan axis', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-14T12:00:00Z'));
    expect(todayUtcDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The key must round-trip through the same UTC axis getWeekDays builds on.
    expect(new Date(`${todayUtcDate()}T00:00:00.000Z`).getUTCHours()).toBe(0);
  });
});
