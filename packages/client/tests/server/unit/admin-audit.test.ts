// @vitest-environment node
// T024 — the admin audit trail (spec 011 FR-AD-021/022/023, research D6).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AUDIT_RETENTION_DAYS, ERASURE_WINDOW_DAYS } from '@server/types/admin';

let mongod: MongoMemoryServer;
let audit: typeof import('@server/lib/audit');
let AdminAuditLog: typeof import('@server/models/admin-audit-log').AdminAuditLog;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  audit = await import('@server/lib/audit');
  ({ AdminAuditLog } = await import('@server/models/admin-audit-log'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await AdminAuditLog.deleteMany({});
});

describe('audit.record / audit.list (FR-AD-021)', () => {
  it('records the acting administrator, the action, the subject, and the time', async () => {
    await audit.record('admin-1', 'feedback.read', {
      userId: 'user-a',
      type: 'feedback',
      id: 'rec-1',
    });

    const [entry] = await audit.list();
    expect(entry?.adminUserId).toBe('admin-1');
    expect(entry?.action).toBe('feedback.read');
    expect(entry?.subjectUserId).toBe('user-a');
    expect(entry?.subjectType).toBe('feedback');
    expect(entry?.subjectId).toBe('rec-1');
    expect(entry?.at).toBeInstanceOf(Date);
  });

  it('filters by administrator, by subject, and by period', async () => {
    await audit.record('admin-1', 'feedback.list');
    await audit.record('admin-2', 'user.data.view', { userId: 'user-b' });

    expect(await audit.list({ adminUserId: 'admin-1' })).toHaveLength(1);
    expect(await audit.list({ subjectUserId: 'user-b' })).toHaveLength(1);
    expect(await audit.list({ from: new Date(Date.now() + 60_000) })).toHaveLength(0);
  });

  it('returns newest first', async () => {
    await audit.record('admin-1', 'feedback.list');
    await new Promise((r) => setTimeout(r, 5));
    await audit.record('admin-1', 'feedback.promote');

    const entries = await audit.list();
    expect(entries[0]?.action).toBe('feedback.promote');
  });

  // The trail is evidence, not a transaction participant: a failed audit write must
  // never turn a successful admin action into a 500 (see lib/audit.ts rationale).
  it('never throws when the write fails', async () => {
    await expect(
      // An action outside the enum fails schema validation inside record().
      audit.record('admin-1', 'not-a-real-action' as never),
    ).resolves.toBeUndefined();
  });
});

describe('append-only is structural (FR-AD-022)', () => {
  // Mongo cannot enforce append-only from inside the app, so the enforcement is that
  // no mutating code path exists. This test fails the moment someone adds one.
  it('the audit module exports only record and list — no update, no delete', async () => {
    const exported = Object.keys(audit).sort();
    expect(exported).toEqual(['list', 'record']);
    for (const name of exported) {
      expect(name).not.toMatch(/update|delete|remove|purge|clear|drop/i);
    }
  });
});

describe('retention margin (FR-AD-023)', () => {
  // The two numbers interlock: an erasure stays reversible for ERASURE_WINDOW_DAYS,
  // and the entry evidencing it must outlive that. Asserted from the constants so
  // editing either one in isolation fails loudly rather than silently losing evidence.
  it('audit retention strictly exceeds the erasure recovery window', () => {
    expect(AUDIT_RETENTION_DAYS).toBeGreaterThan(ERASURE_WINDOW_DAYS);
  });

  it('the TTL index is declared in seconds derived from that constant', () => {
    const ttlIndex = AdminAuditLog.schema
      .indexes()
      .find(([, options]) => options && 'expireAfterSeconds' in options);
    expect(ttlIndex?.[1]?.['expireAfterSeconds']).toBe(AUDIT_RETENTION_DAYS * 24 * 60 * 60);
  });
});
