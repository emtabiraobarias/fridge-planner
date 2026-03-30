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
