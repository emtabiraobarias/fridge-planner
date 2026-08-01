// @vitest-environment node
// T052–T060 — export + two-phase erasure (spec 011 US6: FR-AD-017..020/023).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ERASURE_WINDOW_DAYS } from '@server/types/admin';

let mongod: MongoMemoryServer;
let EXPORT: typeof import('../../app/api/v1/admin/users/[userId]/export/route').GET;
let ERASE: typeof import('../../app/api/v1/admin/users/[userId]/erase/route').POST;
let RESTORE: typeof import('../../app/api/v1/admin/users/[userId]/restore/route').POST;
let PURGE: typeof import('../../app/api/v1/admin/users/purge/route').POST;
let INVENTORY_GET: typeof import('../../app/api/v1/inventory/route').GET;
let AccountErasure: typeof import('@server/models/account-erasure').AccountErasure;
let AdminAuditLog: typeof import('@server/models/admin-audit-log').AdminAuditLog;
let USER_KEYED_MODELS: typeof import('@server/lib/account-purge').USER_KEYED_MODELS;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'dev';
  await (await import('@server/db')).connectDb();
  ({ GET: EXPORT } = await import('../../app/api/v1/admin/users/[userId]/export/route'));
  ({ POST: ERASE } = await import('../../app/api/v1/admin/users/[userId]/erase/route'));
  ({ POST: RESTORE } = await import('../../app/api/v1/admin/users/[userId]/restore/route'));
  ({ POST: PURGE } = await import('../../app/api/v1/admin/users/purge/route'));
  ({ GET: INVENTORY_GET } = await import('../../app/api/v1/inventory/route'));
  ({ AccountErasure } = await import('@server/models/account-erasure'));
  ({ AdminAuditLog } = await import('@server/models/admin-audit-log'));
  ({ USER_KEYED_MODELS } = await import('@server/lib/account-purge'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  // The erase/purge routes are rate-limited (10/min) and the limiter is MODULE-LEVEL
  // state that survives between tests — without this the 11th erase in this file gets
  // a 429 and the test silently asserts against an action that never happened. Uses
  // the FR-AD-029 reset the admin API exposes, which is exactly its purpose.
  const { resetLimiterKey } = await import('@server/rate-limit');
  resetLimiterKey('admin-erase:admin-1');
  resetLimiterKey('admin-purge:admin-1');
});

function req(method = 'GET', admin = 'admin-1', roles = 'admin'): Request {
  return new Request('http://localhost/x', {
    method,
    headers: { 'x-user-id': admin, ...(roles ? { 'x-user-roles': roles } : {}) },
  });
}
const uctx = (userId: string): { params: Promise<{ userId: string }> } => ({
  params: Promise.resolve({ userId }),
});

async function seedEverything(userId: string): Promise<void> {
  const { InventoryItem } = await import('@server/models/inventory-item');
  const { GroceryList } = await import('@server/models/grocery-list');
  const { FeedbackRecord } = await import('@server/models/feedback-record');
  await InventoryItem.create({
    userId,
    name: 'Spinach',
    quantity: 1,
    unit: 'bunch',
    category: 'Produce',
    location: 'fridge',
  });
  await GroceryList.create({
    userId,
    weekStart: new Date('2026-08-03T00:00:00.000Z'),
    generatedAt: null,
    items: [],
  });
  await FeedbackRecord.create({
    userId,
    status: 'draft',
    transcript: [{ role: 'user', content: 'hi', at: new Date() }],
  });
}

describe('export (FR-AD-017)', () => {
  it('covers every user-keyed collection, not just the obvious ones', async () => {
    await seedEverything('user-a');
    const res = await EXPORT(req(), uctx('user-a'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      collections: string[];
      data: Record<string, unknown[]>;
    };

    // The export must name ALL six — the "no orphans" guarantee is only as good as
    // this list, so it is asserted against the shared constant rather than a literal.
    expect(body.collections.sort()).toEqual(USER_KEYED_MODELS.map((m) => m.name).sort());
    expect(body.data['inventory-item']).toHaveLength(1);
    expect(body.data['grocery-list']).toHaveLength(1);
    expect(body.data['feedback-record']).toHaveLength(1);
  });
});

describe('two-phase erasure (FR-AD-018/019)', () => {
  it('makes the account immediately inaccessible, before any purge', async () => {
    await seedEverything('user-a');
    const res = await ERASE(req('POST'), uctx('user-a'));
    expect(res.status).toBe(200);

    // The user themselves is refused at the principal seam — 401, not an empty list,
    // so the account reads as gone rather than as an empty kitchen.
    const asUser = await INVENTORY_GET(
      new Request('http://localhost/api/v1/inventory', { headers: { 'x-user-id': 'user-a' } }),
    );
    expect(asUser.status).toBe(401);

    // …while the data is still there, awaiting the window.
    const { InventoryItem } = await import('@server/models/inventory-item');
    expect(await InventoryItem.countDocuments({ userId: 'user-a' })).toBe(1);
  });

  it('sets a recovery window of exactly the shared constant', async () => {
    const res = await ERASE(req('POST'), uctx('user-a'));
    const body = (await res.json()) as { recoverableForDays: number };
    expect(body.recoverableForDays).toBe(ERASURE_WINDOW_DAYS);
  });

  it('restores inside the window, returning access and data intact', async () => {
    await seedEverything('user-a');
    await ERASE(req('POST'), uctx('user-a'));

    expect((await RESTORE(req('POST'), uctx('user-a'))).status).toBe(200);

    const asUser = await INVENTORY_GET(
      new Request('http://localhost/api/v1/inventory', { headers: { 'x-user-id': 'user-a' } }),
    );
    expect(asUser.status).toBe(200);
    expect(((await asUser.json()) as { items: unknown[] }).items).toHaveLength(1);
  });

  it('refuses restore with 410 once the window has passed — never a silent success', async () => {
    await seedEverything('user-a');
    await ERASE(req('POST'), uctx('user-a'));
    await AccountErasure.updateOne(
      { userId: 'user-a' },
      { $set: { purgeAfter: new Date(Date.now() - 1000) } },
    );

    const res = await RESTORE(req('POST'), uctx('user-a'));
    expect(res.status).toBe(410);
    expect((await res.json()) as { title: string }).toMatchObject({
      title: 'Recovery Window Expired',
    });
  });

  it('refuses a second erasure rather than resetting the window', async () => {
    await ERASE(req('POST'), uctx('user-a'));
    expect((await ERASE(req('POST'), uctx('user-a'))).status).toBe(409);
  });

  // FR-AD-020: never leave the system unadministrable.
  it('refuses an administrator erasing themselves', async () => {
    const res = await ERASE(req('POST', 'admin-1'), uctx('admin-1'));
    expect(res.status).toBe(409);
    expect(await AccountErasure.countDocuments({ userId: 'admin-1' })).toBe(0);
  });

  it('refuses a non-admin', async () => {
    expect((await ERASE(req('POST', 'user-b', ''), uctx('user-a'))).status).toBe(403);
  });
});

describe('purge (FR-AD-018 "no orphans", FR-AD-023)', () => {
  it('leaves ZERO documents in every user-keyed collection', async () => {
    await seedEverything('user-a');
    await ERASE(req('POST'), uctx('user-a'));
    await AccountErasure.updateOne(
      { userId: 'user-a' },
      { $set: { purgeAfter: new Date(Date.now() - 1000) } },
    );

    const res = await PURGE(req('POST'));
    expect(res.status).toBe(200);

    // Asserted across the shared table, so a seventh collection added later without
    // being registered fails here rather than silently orphaning data.
    for (const { name, model } of USER_KEYED_MODELS) {
      expect(await model.countDocuments({ userId: 'user-a' }), `${name} not purged`).toBe(0);
    }
    expect(await AccountErasure.countDocuments({ userId: 'user-a' })).toBe(0);
  });

  it('does not touch an erasure still inside its window', async () => {
    await seedEverything('user-a');
    await ERASE(req('POST'), uctx('user-a'));

    await PURGE(req('POST'));

    const { InventoryItem } = await import('@server/models/inventory-item');
    expect(await InventoryItem.countDocuments({ userId: 'user-a' })).toBe(1);
  });

  it('does not touch OTHER users', async () => {
    await seedEverything('user-a');
    await seedEverything('user-b');
    await ERASE(req('POST'), uctx('user-a'));
    await AccountErasure.updateOne(
      { userId: 'user-a' },
      { $set: { purgeAfter: new Date(Date.now() - 1000) } },
    );

    await PURGE(req('POST'));

    const { InventoryItem } = await import('@server/models/inventory-item');
    expect(await InventoryItem.countDocuments({ userId: 'user-b' })).toBe(1);
  });

  // The 90-vs-30-day margin exists precisely so this holds.
  it('keeps the erasure’s audit entry after the data is gone', async () => {
    await seedEverything('user-a');
    await ERASE(req('POST'), uctx('user-a'));
    await AccountErasure.updateOne(
      { userId: 'user-a' },
      { $set: { purgeAfter: new Date(Date.now() - 1000) } },
    );
    await PURGE(req('POST'));

    const entries = await AdminAuditLog.find({ subjectUserId: 'user-a' }).lean();
    expect(entries.some((e) => e.action === 'user.erase')).toBe(true);
    expect(entries.some((e) => e.action === 'user.purge')).toBe(true);
  });
});
