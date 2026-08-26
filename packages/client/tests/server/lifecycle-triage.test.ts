// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * US1 — the maintainer triages an incoming report.
 *
 * Exercises route handler → controller → model with real `Request` objects, so the
 * authorization, the Zod parse and the atomic guard are all in the path being asserted.
 */

let mongod: MongoMemoryServer;
let LifecycleItem: typeof import('@server/models/lifecycle-item').LifecycleItem;
let FeedbackRecord: typeof import('@server/models/feedback-record').FeedbackRecord;
let QUEUE: typeof import('../../app/api/v1/admin/lifecycle/route');
let ITEM: typeof import('../../app/api/v1/admin/lifecycle/[id]/route');

const ADMIN = 'admin-1';
const REPORTER = 'reporter-1';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'dev';
  const db = await import('@server/db');
  await db.connectDb();
  ({ LifecycleItem } = await import('@server/models/lifecycle-item'));
  ({ FeedbackRecord } = await import('@server/models/feedback-record'));
  QUEUE = await import('../../app/api/v1/admin/lifecycle/route');
  ITEM = await import('../../app/api/v1/admin/lifecycle/[id]/route');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([LifecycleItem.deleteMany({}), FeedbackRecord.deleteMany({})]);
});

/** A request as the maintainer. The dev seam needs BOTH headers — the env default applies only
 *  to requests sending no `x-user-id` at all (CLAUDE.md §8). */
function admin(method: string, body?: unknown): Request {
  return new Request('http://localhost:3000/api/v1/admin/lifecycle', {
    method,
    headers: { 'x-user-id': ADMIN, 'x-user-roles': 'admin', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** An authenticated NON-admin. */
function reporter(method: string, body?: unknown): Request {
  return new Request('http://localhost:3000/api/v1/admin/lifecycle', {
    method,
    headers: { 'x-user-id': REPORTER, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function seed(over: Record<string, unknown> = {}): Promise<string> {
  const rec = await FeedbackRecord.create({
    userId: REPORTER,
    status: 'complete',
    type: 'bug',
    title: 'Grocery rows duplicate',
    transcript: [{ role: 'user', content: 'rows duplicate', at: new Date() }],
  });
  const item = await LifecycleItem.create({
    userId: REPORTER,
    feedbackRecordId: String(rec._id),
    sourceTitle: 'Grocery rows duplicate',
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    stage: 'new',
    ...over,
  });
  return String(item._id);
}

const ctx = (id: string): { params: Promise<{ id: string }> } => ({ params: Promise.resolve({ id }) });

describe('US1 — triage', () => {
  it('accepts a new report at gate 1 (FR-FL-008)', async () => {
    const id = await seed();
    const res = await ITEM.PATCH(admin('PATCH', { action: 'accept' }), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).stage).toBe('accepted');
  });

  it('records WHICH administrator approved the gate (FR-FL-012)', async () => {
    const id = await seed();
    await ITEM.PATCH(admin('PATCH', { action: 'accept' }), ctx(id));
    const item = await LifecycleItem.findById(id).lean();
    const t = item!.transitions.at(-1)!;
    expect(t.actorUserId).toBe(ADMIN);
    // Server-derived, never taken from the request (FR-FL-013).
    expect(t.isGateApproval).toBe(true);
  });

  it('does not flag a plain advance as a gate approval (FR-FL-013)', async () => {
    const id = await seed({ stage: 'accepted' });
    await ITEM.PATCH(admin('PATCH', { action: 'advance' }), ctx(id));
    const item = await LifecycleItem.findById(id).lean();
    expect(item!.transitions.at(-1)!.isGateApproval).toBe(false);
  });

  it.each(['no-action-required', 'declined'] as const)(
    'dismisses with reason %s, stored distinguishably (FR-FL-016/017)',
    async (reason) => {
      const id = await seed();
      const res = await ITEM.PATCH(admin('PATCH', { action: 'dismiss', reason }), ctx(id));
      expect(res.status).toBe(200);
      const item = await LifecycleItem.findById(id).lean();
      expect(item!.stage).toBe('dismissed');
      expect(item!.dismissalReason).toBe(reason);
    },
  );

  it('refuses a dismissal with no reason (FR-FL-016)', async () => {
    const id = await seed();
    const res = await ITEM.PATCH(admin('PATCH', { action: 'dismiss' }), ctx(id));
    expect(res.status).toBe(400);
    expect((await LifecycleItem.findById(id).lean())!.stage).toBe('new');
  });

  it('refuses an illegal transition with 409 and changes nothing (FR-FL-003)', async () => {
    const id = await seed();
    const res = await ITEM.PATCH(admin('PATCH', { action: 'approve-release' }), ctx(id));
    expect(res.status).toBe(409);
    expect((await res.json()).title).toBe('Illegal Transition');
    expect((await LifecycleItem.findById(id).lean())!.stage).toBe('new');
  });

  it('refuses every action out of a closed item (FR-FL-049)', async () => {
    const id = await seed({ stage: 'closed' });
    for (const action of ['accept', 'advance', 'park', 'approve-spec']) {
      const res = await ITEM.PATCH(admin('PATCH', { action }), ctx(id));
      expect(res.status, action).toBe(409);
    }
    expect((await LifecycleItem.findById(id).lean())!.stage).toBe('closed');
  });

  it('applies at most ONE of two concurrent transitions (FR-FL-004)', async () => {
    const id = await seed();
    // Both read `new`; the guarded update pins that stage, so the loser matches nothing.
    const [a, b] = await Promise.all([
      ITEM.PATCH(admin('PATCH', { action: 'accept' }), ctx(id)),
      ITEM.PATCH(admin('PATCH', { action: 'dismiss', reason: 'declined' }), ctx(id)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const item = await LifecycleItem.findById(id).lean();
    expect(item!.transitions).toHaveLength(1);
  });

  it('refuses a non-admin with 403, NOT 401 (FR-FL-055)', async () => {
    const id = await seed();
    const res = await ITEM.PATCH(reporter('PATCH', { action: 'accept' }), ctx(id));
    // 401 would trigger the client's refresh-and-retry and loop (FR-D-010).
    expect(res.status).toBe(403);
    expect((await LifecycleItem.findById(id).lean())!.stage).toBe('new');
  });

  it('refuses a non-admin on the queue too (FR-FL-054)', async () => {
    const res = await QUEUE.GET(reporter('GET'));
    expect(res.status).toBe(403);
  });

  it('marks the source record reviewed on accept (FR-FL-062)', async () => {
    const id = await seed();
    const item = await LifecycleItem.findById(id).lean();
    await ITEM.PATCH(admin('PATCH', { action: 'accept' }), ctx(id));
    const rec = await FeedbackRecord.findById(item!.feedbackRecordId).lean();
    expect(rec!.status).toBe('reviewed');
  });

  it('marks the source record reviewed on DISMISS too (FR-FL-063)', async () => {
    const id = await seed();
    const item = await LifecycleItem.findById(id).lean();
    await ITEM.PATCH(admin('PATCH', { action: 'dismiss', reason: 'declined' }), ctx(id));
    const rec = await FeedbackRecord.findById(item!.feedbackRecordId).lean();
    // A dismissed record left at `complete` is indistinguishable from one nobody has read.
    expect(rec!.status).toBe('reviewed');
  });

  it('edits a record before it briefs, and refuses after (FR-FL-020)', async () => {
    const early = await seed({ stage: 'accepted' });
    const ok = await ITEM.PATCH(admin('PATCH', { action: 'edit-source', sourceTitle: 'Clearer' }), ctx(early));
    expect(ok.status).toBe(200);
    expect((await LifecycleItem.findById(early).lean())!.sourceTitle).toBe('Clearer');

    const late = await seed({ stage: 'briefed' });
    const refused = await ITEM.PATCH(
      admin('PATCH', { action: 'edit-source', sourceTitle: 'Too late' }),
      ctx(late),
    );
    // Clauses were derived from the text; editing it after would silently invalidate the vetting.
    expect(refused.status).toBe(409);
  });

  it('ranks the queue rather than labelling it (FR-FL-022)', async () => {
    const id = await seed();
    const res = await ITEM.PATCH(admin('PATCH', { action: 'set-rank', rank: 2 }), ctx(id));
    expect(res.status).toBe(200);
    expect((await LifecycleItem.findById(id).lean())!.rank).toBe(2);
  });

  it('lists across ALL reporters, in rank order (FR-FL-022/023)', async () => {
    const first = await seed({ rank: 2 });
    const second = await LifecycleItem.create({
      userId: 'reporter-2',
      feedbackRecordId: 'rec-other',
      sourceTitle: 'Other person’s report',
      sourceType: 'improvement',
      sourceAffectedArea: 'inventory',
      stage: 'new',
      rank: 1,
    });

    // An UNRANKED item too. Without one this test cannot see the bug it exists to catch:
    // Mongo sorts a missing field as null, which precedes every number ascending, so a plain
    // `.sort({ rank: 1 })` put unranked items FIRST — the inverse of what FR-FL-022 wants.
    const unranked = await LifecycleItem.create({
      userId: 'reporter-3',
      feedbackRecordId: 'rec-unranked',
      sourceTitle: 'Never ranked',
      sourceType: 'bug',
      sourceAffectedArea: 'grocery',
      stage: 'new',
    });

    const res = await QUEUE.GET(admin('GET'));
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: { _id: string; userId: string }[] };
    expect(items).toHaveLength(3);
    // The queue is the maintainer's, so it spans reporters — that is the point of it.
    expect(items.map((i) => i._id)).toEqual([
      String(second._id), // rank 1
      String(first), // rank 2
      String(unranked._id), // unranked — last, not first
    ]);
    expect(new Set(items.map((i) => i.userId))).toEqual(
      new Set([REPORTER, 'reporter-2', 'reporter-3']),
    );
  });

  it('refuses to delete a record whose item is ACTIVE (FR-FL-006)', async () => {
    const { deleteFeedback } = await import('@server/controllers/feedback');
    const id = await seed({ stage: 'in-progress' });
    const item = await LifecycleItem.findById(id).lean();
    const res = await deleteFeedback(REPORTER, item!.feedbackRecordId);
    expect(res.status).toBe(409);
    expect(await FeedbackRecord.countDocuments({})).toBe(1);
  });

  it.each(['parked', 'closed', 'dismissed', 'merged'])(
    'allows deletion once the item is %s — those are not active (FR-FL-006)',
    async (stage) => {
      const { deleteFeedback } = await import('@server/controllers/feedback');
      const id = await seed({ stage });
      const item = await LifecycleItem.findById(id).lean();
      const res = await deleteFeedback(REPORTER, item!.feedbackRecordId);
      // The old guard exempted only `parked`, which predates these stages existing and would
      // have protected finished work from deletion forever.
      expect(res.status, stage).toBe(204);
      expect(await LifecycleItem.countDocuments({ _id: id })).toBe(0);
    },
  );

  it('filters the queue by stage', async () => {
    await seed();
    await seed({ stage: 'accepted' });
    const res = await QUEUE.GET(
      new Request('http://localhost:3000/api/v1/admin/lifecycle?stage=accepted', {
        headers: { 'x-user-id': ADMIN, 'x-user-roles': 'admin' },
      }),
    );
    const { items } = (await res.json()) as { items: unknown[] };
    expect(items).toHaveLength(1);
  });
});
