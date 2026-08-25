// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/** US2 — the reporter learns what happened, and learns nothing about anyone else. */

let mongod: MongoMemoryServer;
let LifecycleItem: typeof import('@server/models/lifecycle-item').LifecycleItem;
let LIST: typeof import('../../app/api/v1/lifecycle/route');
let ONE: typeof import('../../app/api/v1/lifecycle/[id]/route');
let REPLY: typeof import('../../app/api/v1/admin/lifecycle/[id]/reply/route');

const A = 'reporter-a';
const B = 'reporter-b';
const ADMIN = 'admin-1';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'dev';
  const db = await import('@server/db');
  await db.connectDb();
  ({ LifecycleItem } = await import('@server/models/lifecycle-item'));
  LIST = await import('../../app/api/v1/lifecycle/route');
  ONE = await import('../../app/api/v1/lifecycle/[id]/route');
  REPLY = await import('../../app/api/v1/admin/lifecycle/[id]/reply/route');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await LifecycleItem.deleteMany({});
});

function as(userId: string, roles?: string, body?: unknown): Request {
  return new Request('http://localhost:3000/api/v1/lifecycle', {
    method: body ? 'PUT' : 'GET',
    headers: {
      'x-user-id': userId,
      ...(roles ? { 'x-user-roles': roles } : {}),
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const ctx = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

async function seed(userId: string, over: Record<string, unknown> = {}): Promise<string> {
  const doc = await LifecycleItem.create({
    userId,
    feedbackRecordId: `rec-${userId}-${Math.random()}`,
    sourceTitle: `${userId} report`,
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    stage: 'new',
    ...over,
  });
  return String(doc._id);
}

describe('US2 — reporter visibility', () => {
  it('shows the reporter their own items only (FR-FL-038, SC-FL-003)', async () => {
    await seed(A);
    await seed(B);
    const res = await LIST.GET(as(A));
    const { items } = (await res.json()) as { items: { sourceTitle: string }[] };
    expect(items).toHaveLength(1);
    expect(items[0]!.sourceTitle).toBe('reporter-a report');
  });

  it('404s another reporter’s item — never 403, which would confirm it exists', async () => {
    const id = await seed(B);
    const res = await ONE.GET(as(A), ctx(id));
    expect(res.status).toBe(404);
  });

  it.each([
    ['briefed', 'Being specified'],
    ['in-progress', 'Being built'],
    ['dismissed', 'Not being built'],
  ])('describes %s to the reporter as "%s" (FR-FL-035)', async (stage, label) => {
    const id = await seed(A, { stage, ...(stage === 'dismissed' ? { dismissalReason: 'declined' } : {}) });
    const res = await ONE.GET(as(A), ctx(id));
    expect((await res.json()).stageLabel).toBe(label);
  });

  // FR-FL-065 — the reason IS the closing of the loop for declined work.
  it('shows a dismissed reporter WHY, not just the stage (FR-FL-065)', async () => {
    const id = await seed(A, { stage: 'dismissed', dismissalReason: 'declined' });
    const res = await ONE.GET(as(A), ctx(id));
    const body = (await res.json()) as { dismissalReason?: string };
    expect(body.dismissalReason).toBe('declined');
  });

  it('shows the maintainer reply, once written (FR-FL-036/037)', async () => {
    const id = await seed(A);
    const put = await REPLY.PUT(as(ADMIN, 'admin', { text: 'Good catch — fixing it.' }), ctx(id));
    expect(put.status).toBe(200);

    const res = await ONE.GET(as(A), ctx(id));
    expect((await res.json()).reply.text).toBe('Good catch — fixing it.');
  });

  it('refuses a non-admin writing a reply (FR-FL-054)', async () => {
    const id = await seed(A);
    const res = await REPLY.PUT(as(A, undefined, { text: 'me too' }), ctx(id));
    expect(res.status).toBe(403);
  });

  // The sharpest edge in the whole spec (FR-FL-019, D14): a merged reporter must learn the
  // status and NOTHING else about the target — not its title, text, id or reporter.
  it('shows a merged reporter the target STAGE ONLY (FR-FL-019, SC-FL-003)', async () => {
    const target = await seed(B, { stage: 'shipped', sourceTitle: 'B secret title' });
    const mine = await seed(A, { stage: 'merged', mergedInto: target });

    const res = await ONE.GET(as(A), ctx(mine));
    const body = (await res.json()) as Record<string, unknown>;

    expect(body['mergedTargetStage']).toBe('shipped');
    // Asserted on the SERIALISED body, so a projection done in the UI could not satisfy it.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('B secret title');
    expect(serialised).not.toContain(target);
    expect(serialised).not.toContain(B);
  });
});
