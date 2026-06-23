export type ExpirationStatus = 'expired' | 'expiring-soon' | 'normal' | 'none';

/**
 * Derives expiration status using midnight cutoff (FR-006, FR-007).
 *
 *   expired       — expiresAt <= today's midnight (past or today)
 *   expiring-soon — expiresAt is exactly tomorrow (1 day ahead)
 *   normal        — expiresAt >= 2 days ahead
 *   none          — no date provided
 */
export function getExpirationStatus(expiresAt: Date | undefined): ExpirationStatus {
  if (!expiresAt) return 'none';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiresAt);
  expiry.setHours(0, 0, 0, 0);

  const diffDays = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);

  if (diffDays <= 0) return 'expired';
  if (diffDays === 1) return 'expiring-soon';
  return 'normal';
}

/** Local-midnight boundaries: t1 = tomorrow 00:00, t2 = day-after 00:00. */
function midnightBoundaries(): { t1: Date; t2: Date } {
  const t1 = new Date();
  t1.setHours(0, 0, 0, 0);
  t1.setDate(t1.getDate() + 1);
  const t2 = new Date(t1);
  t2.setDate(t2.getDate() + 1);
  return { t1, t2 };
}

/**
 * Mongo query fragment selecting docs whose status — DERIVED from `expiresAt` at
 * query time (not the persisted `expirationStatus`, which can go stale; BUG #6) —
 * equals `status`. Mirrors getExpirationStatus()'s midnight-cutoff boundaries.
 */
export function expirationStatusQuery(status: string): Record<string, unknown> {
  const { t1, t2 } = midnightBoundaries();
  switch (status) {
    case 'expired':
      return { expiresAt: { $lt: t1 } }; // floor(expiresAt) <= today
    case 'expiring-soon':
      return { expiresAt: { $gte: t1, $lt: t2 } }; // exactly tomorrow
    case 'normal':
      return { expiresAt: { $gte: t2 } }; // >= 2 days ahead
    case 'none':
      return { expiresAt: null }; // matches missing or null
    default:
      return {};
  }
}

/** Mongo query fragment selecting NON-expired docs (no expiry, or expiry not yet reached). */
export function notExpiredQuery(): Record<string, unknown> {
  const { t1 } = midnightBoundaries();
  return { $or: [{ expiresAt: null }, { expiresAt: { $gte: t1 } }] };
}
