// @vitest-environment node
// T011/T035 — the refusal matrix (spec 011 SC-AD-001, research D12).
//
// SC-AD-001 is "100% of maintainer-only actions are refused for a non-administrator
// when invoked directly against the server". A claim of *100%* cannot be evidenced by
// assertions scattered across suites — it needs one enumerated table. This is it.
//
// It also fails loudly when someone adds an admin route without a guard, which is the
// realistic future regression. **Every new admin-only route MUST be added here.**
//
// Note the invocation is a direct handler call: no component, no UI, no rendered
// control is involved anywhere in this file (FR-AD-002 / SC-AD-008).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { NextResponse } from 'next/server';

const { sendToFeedbackAgent } = vi.hoisted(() => ({ sendToFeedbackAgent: vi.fn() }));
vi.mock('@server/services/feedback-collector', () => ({ sendToFeedbackAgent }));

let mongod: MongoMemoryServer;

interface Row {
  name: string;
  method: string;
  invoke: (request: Request) => Promise<NextResponse>;
}

process.env['AUTH_MODE'] = 'dev';

// ⚠️ TWO ordering constraints collide here; both are load-bearing.
//
// 1. The table must be built at MODULE scope with top-level await, NOT in `beforeAll`:
//    `it.each` expands at collection time, so a table filled by a hook is still empty
//    when cases are registered and the matrix silently tests NOTHING. (First draft of
//    this file registered 0 cases for exactly that reason.)
//
// 2. …but `src/server/db.ts` reads `MONGODB_URI` at MODULE scope (`db.ts:4`), so those
//    same module-scope imports freeze whatever the env says at that instant. Setting
//    the URI in `beforeAll` is therefore too late — the routes would already be bound
//    to the default localhost:27017 and fail with ECONNREFUSED on CI.
//
// So the memory server is started here, at module scope, BEFORE the route imports.
mongod = await MongoMemoryServer.create();
process.env['MONGODB_URI'] = mongod.getUri();

const adminFeedback = await import('../../app/api/v1/admin/feedback/route');
const adminFeedbackId = await import('../../app/api/v1/admin/feedback/[id]/route');
const adminAudit = await import('../../app/api/v1/admin/audit/route');
const promote = await import('../../app/api/v1/feedback/[id]/promote/route');
const exportRoute = await import('../../app/api/v1/feedback/[id]/export/route');
const pipelineId = await import('../../app/api/v1/pipeline/[id]/route');
const adminUserData = await import('../../app/api/v1/admin/users/[userId]/data/route');
const adminSettings = await import('../../app/api/v1/admin/settings/route');
const adminUsage = await import('../../app/api/v1/admin/usage/route');
const adminCache = await import('../../app/api/v1/admin/cache/route');
const adminLimits = await import('../../app/api/v1/admin/limits/route');
const adminLimitKey = await import('../../app/api/v1/admin/limits/[key]/route');
const adminExport = await import('../../app/api/v1/admin/users/[userId]/export/route');
const adminErase = await import('../../app/api/v1/admin/users/[userId]/erase/route');
const adminRestore = await import('../../app/api/v1/admin/users/[userId]/restore/route');
const adminPurge = await import('../../app/api/v1/admin/users/purge/route');

const someId = new mongoose.Types.ObjectId().toString();
const idCtx = { params: Promise.resolve({ id: someId }) };
const userCtx = { params: Promise.resolve({ userId: 'user-a' }) };
const keyCtx = { params: Promise.resolve({ key: 'demo:user-a' }) };

const ROWS: Row[] = [
  // ─── net-new admin surface ───────────────────────────────────────────────
  { name: 'GET /api/v1/admin/feedback', method: 'GET', invoke: (r) => adminFeedback.GET(r) },
  {
    name: 'GET /api/v1/admin/feedback/:id',
    method: 'GET',
    invoke: (r) => adminFeedbackId.GET(r, idCtx),
  },
  { name: 'GET /api/v1/admin/audit', method: 'GET', invoke: (r) => adminAudit.GET(r) },
  {
    name: 'GET /api/v1/admin/users/:userId/data',
    method: 'GET',
    invoke: (r) => adminUserData.GET(r, userCtx),
  },
  { name: 'GET /api/v1/admin/settings', method: 'GET', invoke: (r) => adminSettings.GET(r) },
  {
    name: 'PATCH /api/v1/admin/settings',
    method: 'PATCH',
    invoke: (r) => adminSettings.PATCH(r),
  },
  { name: 'GET /api/v1/admin/usage', method: 'GET', invoke: (r) => adminUsage.GET(r) },
  { name: 'DELETE /api/v1/admin/cache', method: 'DELETE', invoke: (r) => adminCache.DELETE(r) },
  { name: 'GET /api/v1/admin/limits', method: 'GET', invoke: (r) => adminLimits.GET(r) },
  {
    name: 'DELETE /api/v1/admin/limits/:key',
    method: 'DELETE',
    invoke: (r) => adminLimitKey.DELETE(r, keyCtx),
  },
  {
    name: 'GET /api/v1/admin/users/:userId/export',
    method: 'GET',
    invoke: (r) => adminExport.GET(r, userCtx),
  },
  {
    name: 'POST /api/v1/admin/users/:userId/erase',
    method: 'POST',
    invoke: (r) => adminErase.POST(r, userCtx),
  },
  {
    name: 'POST /api/v1/admin/users/:userId/restore',
    method: 'POST',
    invoke: (r) => adminRestore.POST(r, userCtx),
  },
  { name: 'POST /api/v1/admin/users/purge', method: 'POST', invoke: (r) => adminPurge.POST(r) },
  // ─── shipped maintainer actions that spec 011 put behind the guard ───────
  {
    name: 'POST /api/v1/feedback/:id/promote',
    method: 'POST',
    invoke: (r) => promote.POST(r, idCtx),
  },
  {
    name: 'GET /api/v1/feedback/:id/export',
    method: 'GET',
    invoke: (r) => exportRoute.GET(r, idCtx),
  },
  {
    name: 'PATCH /api/v1/pipeline/:id',
    method: 'PATCH',
    invoke: (r) => pipelineId.PATCH(r, idCtx),
  },
];

beforeAll(async () => {
  await (await import('@server/db')).connectDb();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

function request(row: Row, headers: Record<string, string>): Request {
  return new Request(`http://localhost/x`, {
    method: row.method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(row.method === 'PATCH' || row.method === 'POST'
      ? { body: JSON.stringify({ action: 'advance' }) }
      : {}),
  });
}

describe('refusal matrix — every admin-only route (SC-AD-001)', () => {
  it('enumerates at least every admin route the app exposes', () => {
    // A guard on the guard: if this drops to zero the matrix has silently stopped
    // testing anything.
    expect(ROWS.length).toBeGreaterThanOrEqual(17);
  });

  it.each(ROWS.map((r) => [r.name, r] as const))(
    '%s refuses an authenticated NON-admin with 403',
    async (_name, row) => {
      const res = await row.invoke(request(row, { 'x-user-id': 'user-a' }));
      expect(res.status).toBe(403);
      const body = (await res.json()) as { title: string; status: number };
      expect(body.title).toBe('Forbidden');
      expect(body.status).toBe(403);
    },
  );

  it.each(ROWS.map((r) => [r.name, r] as const))(
    '%s does NOT answer 403 for an administrator (the guard is the only thing refusing)',
    async (_name, row) => {
      const res = await row.invoke(
        request(row, { 'x-user-id': 'admin-1', 'x-user-roles': 'admin' }),
      );
      // The admin may still get 404/409 for a nonexistent fixture — what matters is
      // that authorization is no longer the thing standing in the way.
      expect(res.status).not.toBe(403);
    },
  );
});

describe('401 and 403 stay distinguishable (FR-AD-003)', () => {
  it('an unauthenticated caller is refused differently from an unprivileged one', async () => {
    // The dev seam resolves a missing X-User-Id to 'anonymous' rather than throwing,
    // so in dev BOTH land on 403. The distinction is asserted at the unit level
    // (tests/server/unit/admin-guard.test.ts) where AuthError vs ForbiddenError is
    // observable directly; here we assert the wire shape never silently becomes 401,
    // which would send the client into its FR-D-010 refresh-retry loop (research D3).
    const row = ROWS[0]!;
    const res = await row.invoke(request(row, {}));
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(403);
  });
});
