// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * US6 — duplicates collapse without leaking.
 * US7 — work survives an erased account.
 *
 * Both are about what the system must NOT do: leak one reporter's report to another, and
 * destroy maintainer work when a reporter leaves.
 */

let mongod: MongoMemoryServer;
let LifecycleItem: typeof import('@server/models/lifecycle-item').LifecycleItem;
let purgeUserData: typeof import('@server/lib/account-purge').purgeUserData;
let ITEM: typeof import('../../app/api/v1/admin/lifecycle/[id]/route');
let OWN: typeof import('../../app/api/v1/lifecycle/[id]/route');

const ADMIN = 'admin-1';
const A = 'reporter-a';
const B = 'reporter-b';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'dev';
  const db = await import('@server/db');
  await db.connectDb();
  ({ LifecycleItem } = await import('@server/models/lifecycle-item'));
  ({ purgeUserData } = await import('@server/lib/account-purge'));
  ITEM = await import('../../app/api/v1/admin/lifecycle/[id]/route');
  OWN = await import('../../app/api/v1/lifecycle/[id]/route');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await LifecycleItem.deleteMany({});
});

function admin(body: unknown): Request {
  return new Request('http://localhost:3000/api/v1/admin/lifecycle', {
    method: 'PATCH',
    headers: { 'x-user-id': ADMIN, 'x-user-roles': 'admin', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function reporter(user: string): Request {
  return new Request('http://localhost:3000/api/v1/lifecycle', {
    headers: { 'x-user-id': user },
  });
}
const ctx = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

let seq = 0;
async function seed(user: string, over: Record<string, unknown> = {}): Promise<string> {
  const doc = await LifecycleItem.create({
    userId: user,
    feedbackRecordId: `rec-${seq++}`,
    sourceTitle: `${user} — grocery rows duplicate`,
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    stage: 'new',
    ...over,
  });
  return String(doc._id);
}

describe('US6 — duplicates collapse without leaking', () => {
  it('merges one report into another and records the target (FR-FL-018)', async () => {
    const target = await seed(A);
    const dupe = await seed(B);

    const res = await ITEM.PATCH(admin({ action: 'merge', targetId: target }), ctx(dupe));
    expect(res.status).toBe(200);

    const item = await LifecycleItem.findById(dupe).lean();
    expect(item!.stage).toBe('merged');
    expect(item!.mergedInto).toBe(target);
  });

  it('refuses merging an item into itself', async () => {
    const id = await seed(A);
    const res = await ITEM.PATCH(admin({ action: 'merge', targetId: id }), ctx(id));
    expect(res.status).toBe(400);
    expect((await LifecycleItem.findById(id).lean())!.stage).toBe('new');
  });

  it('refuses a merge into a target that does not exist', async () => {
    const id = await seed(A);
    const res = await ITEM.PATCH(
      admin({ action: 'merge', targetId: '507f1f77bcf86cd799439011' }),
      ctx(id),
    );
    expect(res.status).toBe(404);
  });

  it('treats merged as terminal — nothing moves it afterwards (FR-FL-002)', async () => {
    const target = await seed(A);
    const dupe = await seed(B);
    await ITEM.PATCH(admin({ action: 'merge', targetId: target }), ctx(dupe));

    for (const action of ['accept', 'advance', 'park']) {
      const res = await ITEM.PATCH(admin({ action }), ctx(dupe));
      expect(res.status, action).toBe(409);
    }
  });

  // The property D14 exists to protect (FR-FL-019, SC-FL-003).
  it('shows the merged reporter the target STAGE ONLY — no title, id or reporter', async () => {
    const target = await seed(A, { stage: 'in-progress', sourceTitle: 'A private wording' });
    const dupe = await seed(B);
    await ITEM.PATCH(admin({ action: 'merge', targetId: target }), ctx(dupe));

    const res = await OWN.GET(reporter(B), ctx(dupe));
    const body = (await res.json()) as Record<string, unknown>;

    expect(body['mergedTargetStage']).toBe('in-progress');
    // Asserted on the serialised body, so a filter applied in the UI could not satisfy it.
    const wire = JSON.stringify(body);
    expect(wire).not.toContain('A private wording');
    expect(wire).not.toContain(target);
    expect(wire).not.toContain(A);
  });
});

describe('US7 — work survives an erased account', () => {
  it('keeps an in-flight item and detaches it (FR-FL-059/060)', async () => {
    const id = await seed(A, { stage: 'in-progress' });
    await purgeUserData(A);

    const item = await LifecycleItem.findById(id).lean();
    expect(item).not.toBeNull();
    expect(item!.userId).not.toBe(A);
    expect(item!.sourceTitle).not.toContain(A);
    expect(item!.reporterErasedAt).toBeInstanceOf(Date);
  });

  it('keeps the detached item ADVANCEABLE through the real endpoint (FR-FL-061)', async () => {
    // The PR is what `in-progress` advances on (FR-FL-067); this test is about the ERASURE not
    // blocking the advance, so it supplies one rather than exercising the missing-PR refusal.
    const id = await seed(A, {
      stage: 'in-progress',
      artifacts: [{ type: 'pull-request', ref: 'https://example.invalid/pull/1', at: new Date() }],
    });
    await purgeUserData(A);

    // Not just "the document still exists" — the maintainer can still carry it forward.
    const res = await ITEM.PATCH(admin({ action: 'advance' }), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).stage).toBe('in-review');
  });

  it('keeps the detached item CLOSABLE, with no reporter to notify (SC-FL-010)', async () => {
    const id = await seed(A, { stage: 'in-review' });
    await purgeUserData(A);

    const shipped = await ITEM.PATCH(admin({ action: 'approve-release' }), ctx(id));
    expect(shipped.status).toBe(200);
    expect((await shipped.json()).stage).toBe('shipped');
  });

  it('drops a reply that was written FOR the erased reporter (FR-FL-060)', async () => {
    const id = await seed(A, {
      stage: 'in-progress',
      reply: { text: 'Hi Alice, fixing this now.', byUserId: ADMIN, at: new Date() },
    });
    await purgeUserData(A);
    const item = await LifecycleItem.findById(id).lean();
    // The reply was addressed to someone who no longer exists.
    expect(item!.reply).toBeUndefined();
  });

  it('leaves other reporters entirely alone (SC-FL-003)', async () => {
    const mine = await seed(A, { stage: 'in-progress' });
    const theirs = await seed(B, { stage: 'in-progress' });
    await purgeUserData(A);

    const kept = await LifecycleItem.findById(theirs).lean();
    expect(kept!.userId).toBe(B);
    expect(kept!.reporterErasedAt).toBeUndefined();
    expect(await LifecycleItem.countDocuments({ _id: mine })).toBe(1);
  });
});
