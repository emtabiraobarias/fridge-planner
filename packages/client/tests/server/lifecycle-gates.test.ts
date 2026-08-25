// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/** US4 — the maintainer moves work through the gates. */

let mongod: MongoMemoryServer;
let LifecycleItem: typeof import('@server/models/lifecycle-item').LifecycleItem;
let AdminAuditLog: typeof import('@server/models/admin-audit-log').AdminAuditLog;
let ITEM: typeof import('../../app/api/v1/admin/lifecycle/[id]/route');

const ADMIN = 'admin-1';
const OTHER_ADMIN = 'admin-2';
const REPORTER = 'reporter-1';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'dev';
  const db = await import('@server/db');
  await db.connectDb();
  ({ LifecycleItem } = await import('@server/models/lifecycle-item'));
  ({ AdminAuditLog } = await import('@server/models/admin-audit-log'));
  ITEM = await import('../../app/api/v1/admin/lifecycle/[id]/route');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([LifecycleItem.deleteMany({}), AdminAuditLog.deleteMany({})]);
});

function as(user: string, body: unknown): Request {
  return new Request('http://localhost:3000/api/v1/admin/lifecycle', {
    method: 'PATCH',
    headers: { 'x-user-id': user, 'x-user-roles': 'admin', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ctx = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

let seq = 0;
async function seed(stage: string, over: Record<string, unknown> = {}): Promise<string> {
  const doc = await LifecycleItem.create({
    userId: REPORTER,
    feedbackRecordId: `rec-${seq++}`,
    sourceTitle: 'Grocery rows duplicate',
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    stage,
    ...over,
  });
  return String(doc._id);
}

describe('US4 — gates and delivery', () => {
  it('gate 2 moves in-spec → in-progress (FR-FL-009)', async () => {
    const id = await seed('in-spec');
    const res = await ITEM.PATCH(as(ADMIN, { action: 'approve-spec' }), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).stage).toBe('in-progress');
  });

  it('gate 3 moves in-review → shipped (FR-FL-010)', async () => {
    const id = await seed('in-review');
    const res = await ITEM.PATCH(as(ADMIN, { action: 'approve-release' }), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).stage).toBe('shipped');
  });

  it.each([
    ['approve-spec', 'in-spec'],
    ['approve-release', 'in-review'],
  ])('records WHICH administrator gave %s (FR-FL-012)', async (action, stage) => {
    const id = await seed(stage);
    await ITEM.PATCH(as(OTHER_ADMIN, { action }), ctx(id));
    const item = await LifecycleItem.findById(id).lean();
    const t = item!.transitions.at(-1)!;
    expect(t.actorUserId).toBe(OTHER_ADMIN);
    // An approval must evidence WHO approved, not merely that approval happened.
    expect(t.isGateApproval).toBe(true);
  });

  it('refuses a gate from a stage it does not govern (FR-FL-015)', async () => {
    const id = await seed('in-progress');
    const res = await ITEM.PATCH(as(ADMIN, { action: 'approve-spec' }), ctx(id));
    expect(res.status).toBe(409);
    expect((await LifecycleItem.findById(id).lean())!.stage).toBe('in-progress');
  });

  it('a rejected spec returns to briefed with its clauses intact (FR-FL-014)', async () => {
    const clauses = [
      {
        provisionalId: 'C-01',
        text: 'When a row duplicates, the system shall collapse it.',
        derivedFrom: 'rows duplicate after checkout',
        inferred: false,
        vetted: 'accepted',
      },
    ];
    const id = await seed('in-spec', { clauses });
    const res = await ITEM.PATCH(as(ADMIN, { action: 'reject-spec', note: 'needs detail' }), ctx(id));
    expect(res.status).toBe(200);

    const item = await LifecycleItem.findById(id).lean();
    // Back to the WORK, never to the reporter.
    expect(item!.stage).toBe('briefed');
    expect(item!.clauses).toHaveLength(1);
    expect(item!.transitions.at(-1)!.note).toBe('needs detail');
  });

  // FR-FL-064 — the gap the design artifact exposed: without this, review finding a problem had
  // nowhere to send the work.
  it('a rejected release returns to in-progress — "changes needed" (FR-FL-064)', async () => {
    const id = await seed('in-review');
    const res = await ITEM.PATCH(
      as(ADMIN, { action: 'reject-release', note: 'changes needed' }),
      ctx(id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).stage).toBe('in-progress');
  });

  it('a release rejection is NOT recorded as a gate approval (FR-FL-013)', async () => {
    const id = await seed('in-review');
    await ITEM.PATCH(as(ADMIN, { action: 'reject-release' }), ctx(id));
    const item = await LifecycleItem.findById(id).lean();
    expect(item!.transitions.at(-1)!.isGateApproval).toBe(false);
  });

  it('parks from any active stage and reopens to exactly where it was (FR-FL-007)', async () => {
    const id = await seed('in-progress');
    await ITEM.PATCH(as(ADMIN, { action: 'park' }), ctx(id));
    expect((await LifecycleItem.findById(id).lean())!.parkedFromStage).toBe('in-progress');

    const res = await ITEM.PATCH(as(ADMIN, { action: 'reopen' }), ctx(id));
    expect(res.status).toBe(200);
    // Reopening into the wrong stage would silently skip a gate.
    expect((await res.json()).stage).toBe('in-progress');
  });

  // SC-FL-006 — the single most important property of the whole delivery half.
  it('shipped is unreachable without a recorded release approval (SC-FL-006)', async () => {
    for (const stage of ['new', 'accepted', 'briefed', 'in-spec', 'in-progress']) {
      const id = await seed(stage);
      const res = await ITEM.PATCH(as(ADMIN, { action: 'approve-release' }), ctx(id));
      expect(res.status, stage).toBe(409);
      expect((await LifecycleItem.findById(id).lean())!.stage).toBe(stage);
    }

    const ok = await seed('in-review');
    await ITEM.PATCH(as(ADMIN, { action: 'approve-release' }), ctx(ok));
    const shipped = await LifecycleItem.findById(ok).lean();
    expect(shipped!.stage).toBe('shipped');
    expect(shipped!.transitions.some((t) => t.to === 'shipped' && t.isGateApproval)).toBe(true);
  });

  it('every transition lands on the append-only audit trail (FR-FL-005)', async () => {
    const id = await seed('in-spec');
    await ITEM.PATCH(as(ADMIN, { action: 'approve-spec' }), ctx(id));
    const entries = await AdminAuditLog.find({ subjectId: id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.adminUserId).toBe(ADMIN);
  });

  // FR-FL-057 / SC-FL-007 — the invariant the whole design rests on.
  it('no action performs a repository write of any kind (SC-FL-007)', async () => {
    const id = await seed('in-review');
    const before = await LifecycleItem.findById(id).lean();
    await ITEM.PATCH(as(ADMIN, { action: 'approve-release' }), ctx(id));
    const after = await LifecycleItem.findById(id).lean();

    // The item is a status record over work a human did. Nothing here may create a commit,
    // merge a PR, tag a release or trigger a deploy — approving the gate only records that a
    // human decided it was allowed.
    expect(after!.artifacts).toEqual(before!.artifacts);
    const serialised = JSON.stringify(after);
    expect(serialised).not.toMatch(/git@|https:\/\/github\.com\/.*\/(commit|compare)/);
  });

  it('does not notify outside the application in this increment (FR-FL-039)', async () => {
    // A negative requirement, so it needs an explicit assertion or nothing ever checks it.
    // No transport is wired: the reporter learns by reading their own status (US2).
    const id = await seed('in-review');
    await ITEM.PATCH(as(ADMIN, { action: 'approve-release' }), ctx(id));
    const item = await LifecycleItem.findById(id).lean();
    expect(item).not.toHaveProperty('notifiedAt');
    expect(item).not.toHaveProperty('notifications');
  });
});
