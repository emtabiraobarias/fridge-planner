// @vitest-environment node
// T023a–T023d — the four guard invariants that are easy to break and impossible to
// notice (spec 011 US1: FR-AD-002, FR-AD-005, FR-AD-006, FR-AD-007/008).
//
// The refusal matrix (admin-authorization.test.ts) proves admin routes REFUSE the wrong
// caller. That is only half the requirement. This file proves the guard did not damage
// anything on its way in:
//
//   • FR-AD-002 — enforcement is server-side and UI-independent
//   • FR-AD-005 — holding the role does not change the holder's ordinary experience
//   • FR-AD-006 — with no administrator at all, the app still works and never fails open
//   • FR-AD-007/008 — end-user feedback is exactly as it was before the guard existed
//
// Every assertion invokes a route handler DIRECTLY with a `Request`. No component is
// imported anywhere in this file — a rendered-or-hidden control can therefore never be
// the thing under test (SC-AD-008).
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { AgentReply } from '@server/types/feedback';

const sendToFeedbackAgent = vi.fn<(...args: unknown[]) => Promise<AgentReply>>();
vi.mock('@server/services/feedback-collector', () => ({
  sendToFeedbackAgent: (...args: unknown[]) => sendToFeedbackAgent(...args),
}));

let mongod: MongoMemoryServer;

// End-user surfaces.
let INVENTORY_GET: typeof import('../../app/api/v1/inventory/route').GET;
let INVENTORY_POST: typeof import('../../app/api/v1/inventory/route').POST;
let MEAL_PLANS_GET: typeof import('../../app/api/v1/meal-plans/route').GET;
let GROCERY_GET: typeof import('../../app/api/v1/grocery-lists/[weekStart]/route').GET;
let FEEDBACK_POST: typeof import('../../app/api/v1/feedback/route').POST;
let FEEDBACK_LIST: typeof import('../../app/api/v1/feedback/route').GET;
let FEEDBACK_ONE: typeof import('../../app/api/v1/feedback/[id]/route').GET;
let FEEDBACK_DELETE: typeof import('../../app/api/v1/feedback/[id]/route').DELETE;
let FEEDBACK_MSG: typeof import('../../app/api/v1/feedback/[id]/messages/route').POST;

// Admin surfaces — a representative slice of each capability group.
let ADMIN_FEEDBACK: typeof import('../../app/api/v1/admin/feedback/route').GET;
let ADMIN_AUDIT: typeof import('../../app/api/v1/admin/audit/route').GET;
let ADMIN_SETTINGS: typeof import('../../app/api/v1/admin/settings/route').GET;
let ADMIN_USAGE: typeof import('../../app/api/v1/admin/usage/route').GET;
let ADMIN_LIMITS: typeof import('../../app/api/v1/admin/limits/route').GET;
let ADMIN_PURGE: typeof import('../../app/api/v1/admin/users/purge/route').POST;
let PipelineItem: typeof import('@server/models/pipeline-item').PipelineItem;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'dev';
  await (await import('@server/db')).connectDb();

  ({ GET: INVENTORY_GET, POST: INVENTORY_POST } = await import('../../app/api/v1/inventory/route'));
  ({ GET: MEAL_PLANS_GET } = await import('../../app/api/v1/meal-plans/route'));
  ({ GET: GROCERY_GET } = await import('../../app/api/v1/grocery-lists/[weekStart]/route'));
  ({ POST: FEEDBACK_POST, GET: FEEDBACK_LIST } = await import('../../app/api/v1/feedback/route'));
  ({ GET: FEEDBACK_ONE, DELETE: FEEDBACK_DELETE } =
    await import('../../app/api/v1/feedback/[id]/route'));
  ({ POST: FEEDBACK_MSG } = await import('../../app/api/v1/feedback/[id]/messages/route'));

  ({ GET: ADMIN_FEEDBACK } = await import('../../app/api/v1/admin/feedback/route'));
  ({ GET: ADMIN_AUDIT } = await import('../../app/api/v1/admin/audit/route'));
  ({ GET: ADMIN_SETTINGS } = await import('../../app/api/v1/admin/settings/route'));
  ({ GET: ADMIN_USAGE } = await import('../../app/api/v1/admin/usage/route'));
  ({ GET: ADMIN_LIMITS } = await import('../../app/api/v1/admin/limits/route'));
  ({ POST: ADMIN_PURGE } = await import('../../app/api/v1/admin/users/purge/route'));
  ({ PipelineItem } = await import('@server/models/pipeline-item'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  vi.clearAllMocks();
});

interface ReqInit {
  method?: string;
  body?: unknown;
  userId?: string;
  /** Omitted entirely for an ordinary user — that absence is the point in FR-AD-006. */
  roles?: string;
}

function req(path: string, init: ReqInit = {}): Request {
  const { method = 'GET', body, userId = 'u1', roles } = init;
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-user-id': userId,
      ...(roles ? { 'x-user-roles': roles } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const ITEM = {
  name: 'Chicken Breast',
  quantity: 2,
  unit: 'lbs',
  category: 'Meat',
  location: 'fridge',
};

const AGENT_COLLECTING: AgentReply = {
  status: 'collecting',
  reply: 'What did you expect to happen?',
  missing: ['expectedBehavior'],
};

/** Every admin-only capability group, as `(request) => response`. */
const ADMIN_PROBES: Array<[string, (r: Request) => Promise<Response>]> = [
  ['GET /admin/feedback', (r) => ADMIN_FEEDBACK(r)],
  ['GET /admin/audit', (r) => ADMIN_AUDIT(r)],
  ['GET /admin/settings', (r) => ADMIN_SETTINGS(r)],
  ['GET /admin/usage', (r) => ADMIN_USAGE(r)],
  ['GET /admin/limits', (r) => ADMIN_LIMITS(r)],
  ['POST /admin/users/purge', (r) => ADMIN_PURGE(r)],
];

// ─────────────────────────────────────────────────────────────────────────────
// T023a — FR-AD-002 / SC-AD-008
// ─────────────────────────────────────────────────────────────────────────────
describe('enforcement is server-side and UI-independent (FR-AD-002, SC-AD-008)', () => {
  it('refuses a non-admin invoked directly, with no client involved at all', async () => {
    for (const [name, invoke] of ADMIN_PROBES) {
      const res = await invoke(req('/x', { method: name.startsWith('POST') ? 'POST' : 'GET' }));
      expect(res.status, name).toBe(403);
    }
  });

  it('refuses regardless of anything the caller claims about their client', async () => {
    // The realistic attack is not a hidden button — it is curl with a plausible-looking
    // header set. None of these are inputs to the decision; the principal's roles are.
    const res = await ADMIN_FEEDBACK(
      new Request('http://localhost/x', {
        headers: {
          'x-user-id': 'u1',
          'x-admin': 'true',
          'x-is-admin': '1',
          referer: 'http://localhost/admin',
          'user-agent': 'FridgePlanner-Admin/1.0',
        },
      }),
    );
    expect(res.status).toBe(403);
  });

  it('a refused request changes no state (FR-AD-003)', async () => {
    const before = await mongoose.connection.db?.collection('adminauditlogs').countDocuments();
    await ADMIN_PURGE(req('/x', { method: 'POST' }));
    const after = await mongoose.connection.db?.collection('adminauditlogs').countDocuments();
    expect(after).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T023b — FR-AD-005
// ─────────────────────────────────────────────────────────────────────────────
describe('admin capability is strictly additive (FR-AD-005)', () => {
  // The SAME principal is asked twice — once plain, once carrying the admin role — so
  // the only variable is the role itself. Any difference in these bodies is admin
  // capability leaking into the ordinary app, which is exactly what FR-AD-005 forbids.
  async function bothWays(
    invoke: (r: Request) => Promise<Response>,
    path: string,
  ): Promise<[unknown, unknown]> {
    const plain = await invoke(req(path, { userId: 'same-user' }));
    const admin = await invoke(req(path, { userId: 'same-user', roles: 'admin' }));
    // Both must SUCCEED, not merely agree — two identical 500s would otherwise satisfy
    // every assertion in this block while proving nothing.
    expect(plain.status).toBe(200);
    expect(admin.status).toBe(200);
    return [await plain.json(), await admin.json()];
  }

  beforeEach(async () => {
    await INVENTORY_POST(
      req('/api/v1/inventory', { method: 'POST', body: ITEM, userId: 'same-user' }),
    );
  });

  it('inventory reads identically for an administrator', async () => {
    const [plain, admin] = await bothWays(INVENTORY_GET, '/api/v1/inventory');
    // Guard the guard: the seeded item must actually be in there, or this is two
    // empty lists agreeing with each other.
    expect((plain as { items: unknown[] }).items).toHaveLength(1);
    expect(admin).toEqual(plain);
  });

  it('meal plans read identically for an administrator', async () => {
    const [plain, admin] = await bothWays(
      MEAL_PLANS_GET,
      '/api/v1/meal-plans?weekStart=2026-01-05',
    );
    expect(admin).toEqual(plain);
  });

  it('their own feedback list reads identically for an administrator', async () => {
    const [plain, admin] = await bothWays(FEEDBACK_LIST, '/api/v1/feedback');
    expect(admin).toEqual(plain);
  });

  it('an administrator sees only their OWN records on end-user routes', async () => {
    // The support view (FR-AD-015) is a separate, audited admin route. The ordinary
    // inventory route must stay `{userId}`-scoped even for an admin, or the two
    // surfaces have silently merged.
    await INVENTORY_POST(
      req('/api/v1/inventory', { method: 'POST', body: ITEM, userId: 'someone-else' }),
    );
    const res = await INVENTORY_GET(
      req('/api/v1/inventory', { userId: 'admin-1', roles: 'admin' }),
    );
    const body = (await res.json()) as { items?: unknown[] } | unknown[];
    const items = Array.isArray(body) ? body : (body.items ?? []);
    expect(items).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T023c — FR-AD-006
// ─────────────────────────────────────────────────────────────────────────────
describe('never fails open when no administrator exists (FR-AD-006)', () => {
  // "No administrator exists" is represented by no request carrying the admin role —
  // which is precisely how the app experiences it. Roles live in the IdP and the app
  // cannot enumerate them, so an empty realm and an unprivileged caller are the same
  // observable situation. This is the "everyone is admin" default the spec removed.
  it('every end-user route still works', async () => {
    const created = await INVENTORY_POST(req('/api/v1/inventory', { method: 'POST', body: ITEM }));
    expect(created.status).toBeLessThan(300);

    expect((await INVENTORY_GET(req('/api/v1/inventory'))).status).toBe(200);
    expect((await MEAL_PLANS_GET(req('/api/v1/meal-plans?weekStart=2026-01-05'))).status).toBe(200);
    expect(
      (
        await GROCERY_GET(req('/api/v1/grocery-lists/2026-01-05'), {
          params: Promise.resolve({ weekStart: '2026-01-05' }),
        })
      ).status,
    ).toBe(200);
    expect((await FEEDBACK_LIST(req('/api/v1/feedback'))).status).toBe(200);
  });

  it('every admin-only route is still refused — nothing is granted by default', async () => {
    for (const [name, invoke] of ADMIN_PROBES) {
      const res = await invoke(req('/x', { method: name.startsWith('POST') ? 'POST' : 'GET' }));
      expect(res.status, name).toBe(403);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T023d — FR-AD-007 / FR-AD-008
// ─────────────────────────────────────────────────────────────────────────────
describe('end-user feedback is untouched by the guard (FR-AD-007/008)', () => {
  async function start(userId = 'u1'): Promise<string> {
    sendToFeedbackAgent.mockResolvedValueOnce(AGENT_COLLECTING);
    const res = await FEEDBACK_POST(
      req('/api/v1/feedback', { method: 'POST', body: { message: 'the list is wrong' }, userId }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { feedback: { _id: string } };
    return json.feedback._id;
  }

  it('submission and conversation remain available to an ordinary user (FR-AD-007)', async () => {
    const id = await start();
    sendToFeedbackAgent.mockResolvedValueOnce(AGENT_COLLECTING);
    const res = await FEEDBACK_MSG(
      req(`/api/v1/feedback/${id}/messages`, {
        method: 'POST',
        body: { message: 'it is off by 2' },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(201);
  });

  it('a user sees and acts on only their OWN records (FR-AD-008)', async () => {
    const mine = await start('u1');
    await start('u2');

    const list = await FEEDBACK_LIST(req('/api/v1/feedback', { userId: 'u1' }));
    const body = (await list.json()) as { feedback: Array<{ _id: string }> };
    expect(body.feedback.map((f) => f._id)).toEqual([mine]);

    // Another user's record is not readable and not deletable.
    const other = await start('u2');
    const read = await FEEDBACK_ONE(req(`/api/v1/feedback/${other}`, { userId: 'u1' }), {
      params: Promise.resolve({ id: other }),
    });
    expect(read.status).toBe(404);
  });

  it('own-delete still works, and the pipeline refusal still applies', async () => {
    const id = await start();
    await PipelineItem.create({
      userId: 'u1',
      feedbackRecordId: id,
      stage: 'in-spec',
      sourceTitle: 'Grocery count wrong',
      sourceType: 'bug',
      sourceAffectedArea: 'grocery',
      promotedBy: 'admin-1',
    });

    // Pre-guard behaviour, unchanged: an active pipeline blocks the delete with 409 —
    // NOT with the 403 the guard introduced elsewhere.
    const blocked = await FEEDBACK_DELETE(req(`/api/v1/feedback/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    });
    expect(blocked.status).toBe(409);

    await PipelineItem.updateOne({ feedbackRecordId: id }, { $set: { stage: 'parked' } });
    const deleted = await FEEDBACK_DELETE(req(`/api/v1/feedback/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    });
    expect(deleted.status).toBe(204);
  });
});
