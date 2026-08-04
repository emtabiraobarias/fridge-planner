import 'server-only';
import { AccountErasure } from '../models/account-erasure';
import { collectUserData, purgeUserData, USER_KEYED_MODELS } from '../lib/account-purge';
import { record as auditRecord } from '../lib/audit';
import { ERASURE_WINDOW_DAYS } from '../types/admin';
import { problem, type ControllerResult } from '../http';

/**
 * Account export and two-phase erasure (spec 011 US6 — FR-AD-017..020).
 *
 * Erasure is deliberately NOT a delete. On request the account becomes immediately
 * inaccessible — enforced in `authenticatePrincipal`, so no controller can forget it —
 * and the data is purged only after a 30-day recovery window. That protects against a
 * mistaken or malicious deletion while still discharging the erasure duty.
 *
 * Purge runs opportunistically here and on explicit trigger, because this codebase has
 * no scheduler (spec 008 chose recompute-on-view over one). The consequence, stated
 * plainly: purge happens *no earlier than* 30 days, not exactly at 30 days — the data
 * is unreachable from day 0 either way, which is what the requirement turns on.
 */

const notFound = (): ControllerResult =>
  problem(404, 'Not Found', 'No erasure found for that user');

/** Is this user currently erased (and not restored)? */
export async function isErased(userId: string): Promise<boolean> {
  const doc = await AccountErasure.findOne({ userId, restoredAt: null }).lean();
  return Boolean(doc);
}

/** GET /admin/users/:userId/export — everything held about a user (FR-AD-017). */
export async function adminExportUser(
  adminUserId: string,
  targetUserId: string,
): Promise<ControllerResult> {
  const data = await collectUserData(targetUserId);
  await auditRecord(adminUserId, 'user.export', { userId: targetUserId, type: 'account' });
  return {
    status: 200,
    body: {
      userId: targetUserId,
      exportedAt: new Date().toISOString(),
      collections: USER_KEYED_MODELS.map((m) => m.name),
      data,
    },
  };
}

/** POST /admin/users/:userId/erase — begin the two-phase erasure (FR-AD-018/020). */
export async function adminEraseUser(
  adminUserId: string,
  targetUserId: string,
): Promise<ControllerResult> {
  // FR-AD-020: never leave the system unadministrable. With a single-tier role model
  // the app cannot enumerate administrators (roles live in the IdP), so the check it
  // *can* make correctly is that an administrator may not erase themselves.
  if (targetUserId === adminUserId) {
    return problem(
      409,
      'Cannot Erase Self',
      'An administrator cannot erase their own account — it would risk leaving the system unadministrable.',
    );
  }

  const existing = await AccountErasure.findOne({ userId: targetUserId, restoredAt: null });
  if (existing) {
    return problem(409, 'Already Erased', 'That account is already erased and awaiting purge.');
  }

  const erasedAt = new Date();
  const purgeAfter = new Date(erasedAt.getTime() + ERASURE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  await AccountErasure.findOneAndUpdate(
    { userId: targetUserId },
    { $set: { erasedAt, purgeAfter, erasedBy: adminUserId }, $unset: { restoredAt: '' } },
    { upsert: true },
  );

  await auditRecord(adminUserId, 'user.erase', { userId: targetUserId, type: 'account' });
  return {
    status: 200,
    body: { userId: targetUserId, erasedAt, purgeAfter, recoverableForDays: ERASURE_WINDOW_DAYS },
  };
}

/** POST /admin/users/:userId/restore — undo inside the window (FR-AD-019). */
export async function adminRestoreUser(
  adminUserId: string,
  targetUserId: string,
): Promise<ControllerResult> {
  const doc = await AccountErasure.findOne({ userId: targetUserId, restoredAt: null });
  if (!doc) return notFound();

  // Past the window the data is gone (or about to be). Refuse EXPLICITLY — a silent
  // "success" against purged data would be the worst possible answer here.
  if (doc.purgeAfter.getTime() <= Date.now()) {
    return problem(
      410,
      'Recovery Window Expired',
      'The recovery window has passed; this erasure is final and cannot be undone.',
    );
  }

  doc.restoredAt = new Date();
  await doc.save();
  await auditRecord(adminUserId, 'user.restore', { userId: targetUserId, type: 'account' });
  return { status: 200, body: { userId: targetUserId, restoredAt: doc.restoredAt } };
}

/** POST /admin/users/purge — purge every erasure whose window has elapsed. */
export async function adminPurgeExpired(adminUserId: string): Promise<ControllerResult> {
  const due = await AccountErasure.find({ restoredAt: null, purgeAfter: { $lte: new Date() } });

  const purged: Array<{ userId: string; counts: Record<string, number> }> = [];
  for (const erasure of due) {
    const counts = await purgeUserData(erasure.userId);
    await AccountErasure.deleteOne({ _id: erasure._id });
    await auditRecord(adminUserId, 'user.purge', { userId: erasure.userId, type: 'account' });
    purged.push({ userId: erasure.userId, counts });
  }

  return { status: 200, body: { purged, count: purged.length } };
}
