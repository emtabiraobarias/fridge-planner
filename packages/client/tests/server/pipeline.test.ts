// @vitest-environment node
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;
let PROMOTE: typeof import('../../app/api/v1/feedback/[id]/promote/route').POST;
let DELETE_ONE: typeof import('../../app/api/v1/feedback/[id]/route').DELETE;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ POST: PROMOTE } = await import('../../app/api/v1/feedback/[id]/promote/route'));
  ({ DELETE: DELETE_ONE } = await import('../../app/api/v1/feedback/[id]/route'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  // dropDatabase() also drops indexes; the unique (userId, feedbackRecordId) index
  // (relied on by the concurrent double-promote test below) must be rebuilt per test.
  const { PipelineItem } = await import('@server/models/pipeline-item');
  await PipelineItem.syncIndexes();
  (globalThis as unknown as { _rateLimitBuckets?: Map<string, unknown> })._rateLimitBuckets?.clear();
});

interface ReqInit {
  method?: string;
  userId?: string;
}
function req(path: string, init: ReqInit = {}): Request {
  const { method = 'POST', userId = 'u1' } = init;
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
  });
}
const ctx = (id: string): { params: Promise<{ id: string }> } => ({ params: Promise.resolve({ id }) });

async function seedCompleteRecord(userId = 'u1'): Promise<string> {
  const { FeedbackRecord } = await import('@server/models/feedback-record');
  const doc = await FeedbackRecord.create({
    userId,
    status: 'complete',
    transcript: [{ role: 'user', content: 'grocery count is wrong', at: new Date() }],
    type: 'bug',
    title: 'Grocery count wrong',
    problemStatement: 'Count mismatches items.',
    userStory: 'As a cook, I want the count to match, so that I trust the list.',
    acceptanceCriteria: [{ given: '5 items', when: 'open page', then: 'count is 5' }],
    reproSteps: ['Open page', 'Add 5 items'],
    expectedBehavior: 'Count is 5.',
    actualBehavior: 'Count is 0.',
    affectedArea: 'grocery',
    priority: 'P2',
  });
  return String(doc._id);
}

async function seedDraftRecord(userId = 'u1'): Promise<string> {
  const { FeedbackRecord } = await import('@server/models/feedback-record');
  const doc = await FeedbackRecord.create({
    userId,
    status: 'draft',
    transcript: [{ role: 'user', content: 'something is off', at: new Date() }],
  });
  return String(doc._id);
}

describe('POST /api/v1/feedback/:id/promote — FR-F-013, D1/D2/D6', () => {
  it('promotes a complete record to 201 at stage approved with seed transition, identity snapshot, and reviewed status', async () => {
    const id = await seedCompleteRecord();
    const res = await PROMOTE(req(`/api/v1/feedback/${id}/promote`), ctx(id));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { pipelineItem: Record<string, unknown> };
    const item = json.pipelineItem;
    expect(item['stage']).toBe('approved');
    expect(item['sourceTitle']).toBe('Grocery count wrong');
    expect(item['sourceType']).toBe('bug');
    expect(item['sourceAffectedArea']).toBe('grocery');
    expect(item['promotedBy']).toBe('u1');
    expect(item['promotedAt']).toBeTruthy();
    expect(item['transitions']).toEqual([
      expect.objectContaining({ from: null, to: 'approved', actor: 'human', isGateApproval: true }),
    ]);

    const { FeedbackRecord } = await import('@server/models/feedback-record');
    const record = await FeedbackRecord.findById(id);
    expect(record?.status).toBe('reviewed');
  });

  it('[analyze M1] re-promoting the already-reviewed record returns 200 with the identical item, not a 409', async () => {
    const id = await seedCompleteRecord();
    const first = await PROMOTE(req(`/api/v1/feedback/${id}/promote`), ctx(id));
    const firstJson = (await first.json()) as { pipelineItem: { _id: string } };

    const second = await PROMOTE(req(`/api/v1/feedback/${id}/promote`), ctx(id));
    expect(second.status).toBe(200);
    const secondJson = (await second.json()) as { pipelineItem: { _id: string } };
    expect(secondJson.pipelineItem._id).toBe(firstJson.pipelineItem._id);

    const { PipelineItem } = await import('@server/models/pipeline-item');
    const count = await PipelineItem.countDocuments({ feedbackRecordId: id, userId: 'u1' });
    expect(count).toBe(1);
  });

  it('resolves a concurrent double-promote race to exactly one item, the loser also returning the existing item', async () => {
    const id = await seedCompleteRecord();
    const [a, b] = await Promise.all([
      PROMOTE(req(`/api/v1/feedback/${id}/promote`), ctx(id)),
      PROMOTE(req(`/api/v1/feedback/${id}/promote`), ctx(id)),
    ]);
    const statuses = [a.status, b.status].sort();
    // One creator (201) and one idempotent/race-loser (200) — or, if the race lands
    // such that both see "no existing item" before either commits, the unique index
    // guarantees only one insert survives and the loser still resolves to 200.
    expect(statuses).toEqual([200, 201]);

    const { PipelineItem } = await import('@server/models/pipeline-item');
    const count = await PipelineItem.countDocuments({ feedbackRecordId: id, userId: 'u1' });
    expect(count).toBe(1);

    const aJson = (await a.clone().json()) as { pipelineItem: { _id: string } };
    const bJson = (await b.clone().json()) as { pipelineItem: { _id: string } };
    expect(aJson.pipelineItem._id).toBe(bJson.pipelineItem._id);
  });

  it('refuses to promote a draft/incomplete record with 409', async () => {
    const id = await seedDraftRecord();
    const res = await PROMOTE(req(`/api/v1/feedback/${id}/promote`), ctx(id));
    expect(res.status).toBe(409);
  });

  it('returns 404 for a nonexistent record id', async () => {
    const res = await PROMOTE(req('/api/v1/feedback/000000000000000000000000/promote'), ctx('000000000000000000000000'));
    expect(res.status).toBe(404);
  });

  it('returns 404 for another user’s record (no existence leak)', async () => {
    const id = await seedCompleteRecord('u1');
    const res = await PROMOTE(req(`/api/v1/feedback/${id}/promote`, { userId: 'u2' }), ctx(id));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/feedback/:id — delete-protection (EC-06, D9)', () => {
  it('refuses deletion with 409 while an active (non-parked) PipelineItem exists', async () => {
    const id = await seedCompleteRecord();
    await PROMOTE(req(`/api/v1/feedback/${id}/promote`), ctx(id));

    const res = await DELETE_ONE(req(`/api/v1/feedback/${id}`, { method: 'DELETE' }), ctx(id));
    expect(res.status).toBe(409);

    const { FeedbackRecord } = await import('@server/models/feedback-record');
    expect(await FeedbackRecord.findById(id)).not.toBeNull();
  });

  it('cascades: deleting a record whose PipelineItem is parked succeeds (204) and removes the parked item', async () => {
    const id = await seedCompleteRecord();
    await PROMOTE(req(`/api/v1/feedback/${id}/promote`), ctx(id));

    // DL2's PATCH transition endpoint doesn't exist yet in this phase — seed the
    // parked state directly via the model, mirroring feedback.test.ts's transcript-cap
    // seeding pattern.
    const { PipelineItem } = await import('@server/models/pipeline-item');
    await PipelineItem.updateOne({ userId: 'u1', feedbackRecordId: id }, { $set: { stage: 'parked' } });

    const res = await DELETE_ONE(req(`/api/v1/feedback/${id}`, { method: 'DELETE' }), ctx(id));
    expect(res.status).toBe(204);

    const { FeedbackRecord } = await import('@server/models/feedback-record');
    expect(await FeedbackRecord.findById(id)).toBeNull();
    expect(await PipelineItem.findOne({ userId: 'u1', feedbackRecordId: id })).toBeNull();
  });

  it('deletes a record with no PipelineItem exactly as before (204, unchanged behavior)', async () => {
    const id = await seedCompleteRecord();
    const res = await DELETE_ONE(req(`/api/v1/feedback/${id}`, { method: 'DELETE' }), ctx(id));
    expect(res.status).toBe(204);
  });
});
