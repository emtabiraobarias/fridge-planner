import 'server-only';
import { AdminAuditLog } from '../models/admin-audit-log';
import type { AdminAuditAction, AdminSubjectType, IAdminAuditLog } from '../types/admin';

/**
 * The admin audit trail (spec 011 FR-AD-021/022).
 *
 * This module exports exactly two operations — `record` and `list`. There is
 * deliberately **no update and no delete path anywhere in the application**, because
 * "append-only" cannot be enforced by MongoDB permissions from inside the app: the
 * absence of a mutating code path IS the enforcement. Retention is handled by the
 * model's TTL index (FR-AD-023), never by application deletes.
 *
 * Adding a mutating export here would silently break FR-AD-022 — don't.
 */

export interface AuditSubject {
  userId?: string;
  type?: AdminSubjectType;
  id?: string;
}

/**
 * Record one administrative action.
 *
 * Deliberately **never throws**: an audit write failing must not turn a successful
 * admin action into a 500, nor roll back work the operator can see already happened.
 * A failure is logged and swallowed — the trail is evidence, not a transaction
 * participant. (If audit integrity ever needs to gate the action itself, that is a
 * spec change, not a quiet behaviour change here.)
 */
export async function record(
  adminUserId: string,
  action: AdminAuditAction,
  subject: AuditSubject = {},
): Promise<void> {
  try {
    await AdminAuditLog.create({
      adminUserId,
      action,
      at: new Date(),
      ...(subject.userId ? { subjectUserId: subject.userId } : {}),
      ...(subject.type ? { subjectType: subject.type } : {}),
      ...(subject.id ? { subjectId: subject.id } : {}),
    });
  } catch (err) {
    console.error('[audit] failed to record admin action', { adminUserId, action, err });
  }
}

export interface AuditQuery {
  adminUserId?: string;
  subjectUserId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

/** Read the trail, newest first, filtered by administrator / subject / period. */
export async function list(query: AuditQuery = {}): Promise<IAdminAuditLog[]> {
  const filter: Record<string, unknown> = {};
  if (query.adminUserId) filter['adminUserId'] = query.adminUserId;
  if (query.subjectUserId) filter['subjectUserId'] = query.subjectUserId;
  if (query.from || query.to) {
    filter['at'] = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }
  return AdminAuditLog.find(filter)
    .sort({ at: -1 })
    .limit(Math.min(query.limit ?? 200, 500))
    .lean<IAdminAuditLog[]>();
}
