/**
 * Spec 011 administration types + the two retention constants whose RELATIONSHIP is
 * load-bearing (FR-AD-023).
 *
 * `AUDIT_RETENTION_DAYS` must stay strictly greater than `ERASURE_WINDOW_DAYS`, so the
 * audit entry evidencing an account erasure always outlives the moment that erasure
 * became irreversible. They live together, in one file, precisely so the invariant is
 * visible at the point of edit — and a unit test asserts it from these constants, so
 * changing either one in isolation fails loudly instead of silently losing evidence.
 */

/** FR-AD-023 — admin audit entries are retained at least this long (TTL index). */
export const AUDIT_RETENTION_DAYS = 90;

/** FR-AD-018 — an erased account is recoverable for this long, then purged. */
export const ERASURE_WINDOW_DAYS = 30;

/** Every administrative action that is recorded (FR-AD-021). */
export const ADMIN_AUDIT_ACTIONS = [
  'feedback.list',
  'feedback.read',
  'feedback.promote',
  'feedback.export',
  'pipeline.transition',
  // Spec 012. `pipeline.transition` is kept for entries written before the rename — the audit
  // trail is append-only, so historic actions cannot be relabelled.
  'lifecycle.transition',
  'lifecycle.edit',
  'lifecycle.rank',
  'user.data.view',
  'user.export',
  'user.erase',
  'user.restore',
  'user.purge',
  'settings.update',
  'cache.flush',
  'limits.reset',
] as const;

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

export const ADMIN_SUBJECT_TYPES = [
  'feedback',
  'pipelineItem',
  'lifecycle',
  'account',
  'setting',
  'cache',
  'limit',
] as const;

export type AdminSubjectType = (typeof ADMIN_SUBJECT_TYPES)[number];

/** One append-only record of an administrative action (FR-AD-021/022). */
export interface IAdminAuditLog {
  adminUserId: string;
  action: AdminAuditAction;
  subjectUserId?: string;
  subjectType?: AdminSubjectType;
  subjectId?: string;
  at: Date;
}
