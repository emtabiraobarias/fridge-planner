// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const ISS = 'https://issuer.test';

let mongod: MongoMemoryServer;
let meRoute: typeof import('../../app/api/v1/accounts/me/route');
let exportRoute: typeof import('../../app/api/v1/accounts/me/export/route');
let Account: typeof import('@server/models/account').Account;
let AccountErasure: typeof import('@server/models/account-erasure').AccountErasure;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let AdminAuditLog: typeof import('@server/models/admin-audit-log').AdminAuditLog;
let adminAccounts: typeof import('@server/controllers/admin-accounts');
let idp: typeof import('@server/services/identity-provider');

function stubProvider(): Record<string, ReturnType<typeof vi.fn>> {
  const provider = {
    createUser: vi.fn(async () => 'provider-sub-1'),
    sendVerification: vi.fn(async () => undefined),
    initiatePasswordReset: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    deleteUser: vi.fn(async () => undefined),
  };
  vi.spyOn(idp, 'identityProvider').mockReturnValue(provider as never);
  return provider as Record<string, ReturnType<typeof vi.fn>>;
}

function asUser(userId: string, init: RequestInit = {}, roles = ''): Request {
  return new Request('http://localhost/api/v1/accounts/me', {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-user-id': userId,
      'x-user-roles': roles,
      ...(init.headers ?? {}),
    },
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // db.ts reads MONGODB_URI at MODULE SCOPE — import after this line (CLAUDE.md §8).
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'dev';
  process.env['AUTH_ISSUER'] = ISS;
  const db = await import('@server/db');
  await db.connectDb();
  idp = await import('@server/services/identity-provider');
  meRoute = await import('../../app/api/v1/accounts/me/route');
  exportRoute = await import('../../app/api/v1/accounts/me/export/route');
  ({ Account } = await import('@server/models/account'));
  ({ AccountErasure } = await import('@server/models/account-erasure'));
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ AdminAuditLog } = await import('@server/models/admin-audit-log'));
  adminAccounts = await import('@server/controllers/admin-accounts');
  await Account.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  delete process.env['AUTH_MODE'];
  delete process.env['AUTH_ISSUER'];
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([
    Account.deleteMany({}),
    AccountErasure.deleteMany({}),
    InventoryItem.deleteMany({}),
    AdminAuditLog.deleteMany({}),
  ]);
});

async function seedUser(email = 'ada@example.com', subject = 'provider-sub-1'): Promise<string> {
  const a = await Account.create({
    email,
    displayName: 'Ada',
    identities: [{ issuer: ISS, subject, linkedAt: new Date() }],
  });
  await InventoryItem.create({
    userId: a._id.toString(),
    name: 'Milk',
    quantity: 1,
    unit: 'litre',
    category: 'Dairy',
    location: 'fridge',
  });
  return a._id.toString();
}

describe('GET /api/v1/accounts/me/export (FR-AC-024)', () => {
  it('covers every store keyed to the caller', async () => {
    const id = await seedUser();
    const res = await exportRoute.GET(asUser(id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      collections: string[];
      data: Record<string, unknown[]>;
    };

    // Asserted against the SHIPPED model list, not a literal — the same rule CLAUDE.md §5
    // states for the delete list. A hardcoded expectation here would keep passing while a
    // new user-keyed collection quietly went unexported.
    const { ALL_USER_DATA_MODELS } = await import('@server/lib/account-purge');
    expect(body.collections.sort()).toEqual(ALL_USER_DATA_MODELS.map((m) => m.name).sort());
    for (const name of body.collections) expect(body.data[name]).toBeDefined();
    expect(body.data['inventory-item']).toHaveLength(1);
    expect(body.data['account']).toHaveLength(1);
  });

  it('exports only the CALLER’s data', async () => {
    const mine = await seedUser('ada@example.com', 'sub-a');
    await seedUser('grace@example.com', 'sub-b');
    const res = await exportRoute.GET(asUser(mine));
    const body = (await res.json()) as { data: Record<string, Array<{ userId?: string }>> };
    for (const row of body.data['inventory-item'] ?? []) expect(row.userId).toBe(mine);
    expect(body.data['account']).toHaveLength(1);
  });

  it('is recorded in the audit log (FR-AC-027)', async () => {
    const id = await seedUser();
    await exportRoute.GET(asUser(id));
    const entries = await AdminAuditLog.find({ subjectUserId: id }).lean();
    expect(entries.map((e) => e.action)).toContain('account.self-export');
  });

  it('refuses an unauthenticated caller', async () => {
    process.env['AUTH_MODE'] = 'oidc';
    const res = await exportRoute.GET(new Request('http://localhost/api/v1/accounts/me/export'));
    expect(res.status).toBe(401);
    process.env['AUTH_MODE'] = 'dev';
  });
});

describe('DELETE /api/v1/accounts/me (FR-AC-025)', () => {
  it('is two-phase: access stops at once, data survives the window', async () => {
    stubProvider();
    const id = await seedUser();
    const res = await meRoute.DELETE(asUser(id, { method: 'DELETE' }));
    expect(res.status).toBe(202);

    // Immediately inaccessible — the refusal lives in `authenticate()`, so no controller can
    // forget it.
    expect((await meRoute.GET(asUser(id))).status).toBe(401);
    // …but nothing is destroyed yet. That is the whole point of the window.
    expect(await InventoryItem.countDocuments({ userId: id })).toBe(1);
    expect(await Account.findById(id)).not.toBeNull();
  });

  it('reuses 011’s erasure record rather than a second mechanism', async () => {
    // A parallel self-service deletion path would mean two things to reconcile at purge, two
    // recovery windows, and two places to get the refusal wrong.
    stubProvider();
    const id = await seedUser();
    await meRoute.DELETE(asUser(id, { method: 'DELETE' }));
    const erasure = await AccountErasure.findOne({ userId: id }).lean();
    expect(erasure).not.toBeNull();
    expect(erasure?.erasedBy).toBe(id);
  });

  it('is restorable inside the window, and the data comes back', async () => {
    stubProvider();
    const id = await seedUser();
    await meRoute.DELETE(asUser(id, { method: 'DELETE' }));
    const restored = await adminAccounts.adminRestoreUser('admin-1', id);
    expect(restored.status).toBe(200);
    expect((await meRoute.GET(asUser(id))).status).toBe(200);
    expect(await InventoryItem.countDocuments({ userId: id })).toBe(1);
  });

  it('refuses when the caller is an administrator (FR-AC-026)', async () => {
    // Roles live in the identity provider, so the app cannot enumerate administrators and
    // cannot literally know whether one would be left. The check it CAN make correctly is
    // the same one `011` FR-AD-020 makes: an administrator may not delete themselves.
    stubProvider();
    const id = await seedUser();
    const res = await meRoute.DELETE(asUser(id, { method: 'DELETE' }, 'admin'));
    expect(res.status).toBe(409);
    expect(await AccountErasure.countDocuments({ userId: id })).toBe(0);
    expect((await meRoute.GET(asUser(id, {}, 'admin'))).status).toBe(200);
  });

  it('is recorded in the audit log (FR-AC-027)', async () => {
    stubProvider();
    const id = await seedUser();
    await meRoute.DELETE(asUser(id, { method: 'DELETE' }));
    const entries = await AdminAuditLog.find({ subjectUserId: id }).lean();
    expect(entries.map((e) => e.action)).toContain('account.self-delete');
  });

  it('is idempotent — a second delete does not restart the window', async () => {
    stubProvider();
    const id = await seedUser();
    await meRoute.DELETE(asUser(id, { method: 'DELETE' }));
    const first = await AccountErasure.findOne({ userId: id }).lean();
    const again = await meRoute.DELETE(asUser(id, { method: 'DELETE' }));
    // The account is already inaccessible, so the second call cannot even authenticate.
    expect(again.status).toBe(401);
    const second = await AccountErasure.findOne({ userId: id }).lean();
    expect(second?.purgeAfter).toEqual(first?.purgeAfter);
  });
});

describe('the provider account follows the erasure (FR-AC-039/040/041)', () => {
  it('SUSPENDS the provider account on erasure', async () => {
    // Without this, deletion is app-only: the provider knows nothing, so the user
    // authenticates successfully, receives a brand-new valid token, and meets a 401 on every
    // request — signed in and locked out at the same time.
    const provider = stubProvider();
    const id = await seedUser();
    await meRoute.DELETE(asUser(id, { method: 'DELETE' }));
    expect(provider['suspend']).toHaveBeenCalledWith('provider-sub-1');
    expect(provider['deleteUser']).not.toHaveBeenCalled();
  });

  it('suspends EVERY linked provider identity, not just the first', async () => {
    // After US4 an account answers to several pairs. Suspending one would leave the others
    // able to obtain fresh tokens for an erased account.
    const provider = stubProvider();
    const a = await Account.create({
      email: 'multi@example.com',
      displayName: 'Multi',
      identities: [
        { issuer: ISS, subject: 'sub-a', linkedAt: new Date() },
        { issuer: 'https://other.test', subject: 'sub-b', linkedAt: new Date() },
      ],
    });
    await meRoute.DELETE(asUser(a._id.toString(), { method: 'DELETE' }));
    expect(provider['suspend'].mock.calls.map((c) => c[0]).sort()).toEqual(['sub-a', 'sub-b']);
  });

  it('RESUMES it when the erasure is reversed inside the window', async () => {
    const provider = stubProvider();
    const id = await seedUser();
    await meRoute.DELETE(asUser(id, { method: 'DELETE' }));
    await adminAccounts.adminRestoreUser('admin-1', id);
    expect(provider['resume']).toHaveBeenCalledWith('provider-sub-1');
  });

  it('DELETES it at purge', async () => {
    const provider = stubProvider();
    const id = await seedUser();
    await meRoute.DELETE(asUser(id, { method: 'DELETE' }));
    // Wind the window back so the purge is due.
    await AccountErasure.updateOne({ userId: id }, { $set: { purgeAfter: new Date(0) } });
    await adminAccounts.adminPurgeExpired('admin-1');

    expect(provider['deleteUser']).toHaveBeenCalledWith('provider-sub-1');
    expect(await Account.findById(id)).toBeNull();
    expect(await InventoryItem.countDocuments({ userId: id })).toBe(0);
  });

  it('reads the provider subjects BEFORE the account row is deleted', async () => {
    // Ordering, not decoration: `purgeUserData` deletes the `accounts` document, which is the
    // only place the provider subjects are recorded. Read them afterwards and there is
    // nothing left to delete at the provider — the account would survive there forever.
    const provider = stubProvider();
    const id = await seedUser();
    await meRoute.DELETE(asUser(id, { method: 'DELETE' }));
    await AccountErasure.updateOne({ userId: id }, { $set: { purgeAfter: new Date(0) } });
    await adminAccounts.adminPurgeExpired('admin-1');
    expect(provider['deleteUser']).toHaveBeenCalledOnce();
  });

  it('completes the app-side erasure even when the provider call fails', async () => {
    // The user asked to be deleted. A provider outage must not leave them un-erased in the
    // app as well — the app-side refusal is what actually stops access, and the provider can
    // be reconciled by re-running the purge.
    vi.spyOn(idp, 'identityProvider').mockReturnValue({
      suspend: vi.fn(async () => {
        throw new Error('provider down');
      }),
    } as never);
    const id = await seedUser();
    const res = await meRoute.DELETE(asUser(id, { method: 'DELETE' }));
    expect(res.status).toBe(202);
    expect(await AccountErasure.countDocuments({ userId: id, restoredAt: null })).toBe(1);
  });

  it('suspends on an ADMINISTRATOR-initiated erasure too', async () => {
    // Same requirement, other entry point. Wiring it only into the self-service path would
    // leave every admin erasure app-only — the exact hole FR-AC-039 names.
    const provider = stubProvider();
    const id = await seedUser();
    await adminAccounts.adminEraseUser('admin-1', id);
    expect(provider['suspend']).toHaveBeenCalledWith('provider-sub-1');
  });
});

describe('a pre-migration identity does not break the erasure paths', () => {
  it('admin-erases a user whose id is a provider subject, not an ObjectId', async () => {
    // Every `userId` in a live database IS a provider subject until the migration runs, and
    // `Account.findById` THROWS on one rather than returning null. Before `lib/account-id.ts`
    // this path 500'd — so on deploy day, before the migration, erasing anyone at all would
    // have failed. Caught by the EXISTING 011 tests, which is the third time this exact trap
    // has surfaced in spec 013.
    stubProvider();
    await InventoryItem.create({
      userId: 'legacy-provider-subject',
      name: 'Milk',
      quantity: 1,
      unit: 'litre',
      category: 'Dairy',
      location: 'fridge',
    });
    const res = await adminAccounts.adminEraseUser('admin-1', 'legacy-provider-subject');
    expect(res.status).toBe(200);
  });

  it('purges one too, without trying to delete a provider account it cannot name', async () => {
    const provider = stubProvider();
    await InventoryItem.create({
      userId: 'legacy-provider-subject',
      name: 'Milk',
      quantity: 1,
      unit: 'litre',
      category: 'Dairy',
      location: 'fridge',
    });
    await adminAccounts.adminEraseUser('admin-1', 'legacy-provider-subject');
    await AccountErasure.updateOne(
      { userId: 'legacy-provider-subject' },
      { $set: { purgeAfter: new Date(0) } },
    );
    const res = await adminAccounts.adminPurgeExpired('admin-1');

    expect(res.status).toBe(200);
    expect(await InventoryItem.countDocuments({ userId: 'legacy-provider-subject' })).toBe(0);
    // No `accounts` row, so no subject to act on — and nothing invented in its place.
    expect(provider['deleteUser']).not.toHaveBeenCalled();
  });
});

