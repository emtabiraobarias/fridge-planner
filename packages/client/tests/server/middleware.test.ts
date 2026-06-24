// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

describe('rateLimit', () => {
  it('allows up to the limit then blocks within the window', () => {
    const key = `t-${Math.random()}`;
    const r1 = rateLimit(key, 2, 60_000);
    const r2 = rateLimit(key, 2, 60_000);
    const r3 = rateLimit(key, 2, 60_000);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('resets after the window elapses', () => {
    const key = `t-${Math.random()}`;
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(rateLimit(key, 1, 1000).allowed).toBe(true);
    expect(rateLimit(key, 1, 1000).allowed).toBe(false);
    spy.mockReturnValue(now + 1001);
    expect(rateLimit(key, 1, 1000).allowed).toBe(true);
    spy.mockRestore();
  });
});

describe('withRoute', () => {
  it('passes a successful response through unchanged', async () => {
    const res = await withRoute(async () => problemResponse(200, 'OK', 'fine'));
    expect(res.status).toBe(200);
  });

  it('converts an unhandled throw into a 500 Problem JSON', async () => {
    const res = await withRoute(async () => {
      throw new Error('boom');
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { title: string; status: number };
    expect(body.title).toBe('Internal Server Error');
    expect(body.status).toBe(500);
  });
});
