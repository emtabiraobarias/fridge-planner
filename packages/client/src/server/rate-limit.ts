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
