import 'server-only';

interface WindowState {
  count: number;
  resetAt: number;
}

// Fixed-window in-memory rate limiter. The app runs as a single Node process
// (output: standalone), so a module-level Map is sufficient; cache it on globalThis
// so dev hot-reloads don't reset the windows. Replaces the Express express-rate-limit
// middleware (recommendationsLimiter: 10/min).
const globalForLimiter = globalThis as unknown as { _rateLimitBuckets?: Map<string, WindowState> };
const buckets: Map<string, WindowState> = (globalForLimiter._rateLimitBuckets ??= new Map());

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

/** Record a hit for `key` and report whether it is within `limit` per `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/**
 * Spec 011 FR-AD-029 — administrator visibility and reset for the in-memory limiter.
 *
 * These are additive: `rateLimit()` above is untouched. The store is per-instance and
 * resets on deploy (the Phase E5 caveat is unchanged) — that is exactly why an operator
 * needs to *see* it rather than infer it.
 */
export interface LimiterBucketView {
  key: string;
  count: number;
  resetsAt: number;
}

export function inspectLimiter(): LimiterBucketView[] {
  return [...buckets.entries()].map(([key, state]) => ({
    key,
    count: state.count,
    resetsAt: state.resetAt,
  }));
}

/** Clear one bucket (a user throttled in error). Returns whether anything was cleared. */
export function resetLimiterKey(key: string): boolean {
  return buckets.delete(key);
}
