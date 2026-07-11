// @vitest-environment node
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { AgentReply } from '@server/types/feedback';

// The Holodeck agent client is mocked — these tests exercise controller + handler logic
// (persistence, state transitions, isolation, rate limiting) without a live sidecar.
const sendToFeedbackAgent = vi.fn<(...args: unknown[]) => Promise<AgentReply>>();
vi.mock('@server/services/feedback-collector', () => ({
  sendToFeedbackAgent: (...args: unknown[]) => sendToFeedbackAgent(...args),
}));

let mongod: MongoMemoryServer;
let POST_START: typeof import('../../app/api/v1/feedback/route').POST;
let GET_LIST: typeof import('../../app/api/v1/feedback/route').GET;
let GET_ONE: typeof import('../../app/api/v1/feedback/[id]/route').GET;
let DELETE_ONE: typeof import('../../app/api/v1/feedback/[id]/route').DELETE;
let POST_MSG: typeof import('../../app/api/v1/feedback/[id]/messages/route').POST;
let GET_EXPORT: typeof import('../../app/api/v1/feedback/[id]/export/route').GET;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['FEEDBACK_AGENT_URL'] = 'http://localhost:8002';
  const db = await import('@server/db');
  await db.connectDb();
  ({ POST: POST_START, GET: GET_LIST } = await import('../../app/api/v1/feedback/route'));
  ({ GET: GET_ONE, DELETE: DELETE_ONE } = await import('../../app/api/v1/feedback/[id]/route'));
  ({ POST: POST_MSG } = await import('../../app/api/v1/feedback/[id]/messages/route'));
  ({ GET: GET_EXPORT } = await import('../../app/api/v1/feedback/[id]/export/route'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  sendToFeedbackAgent.mockReset();
  // Clear the in-memory rate-limit windows so counts don't leak across tests.
  (globalThis as unknown as { _rateLimitBuckets?: Map<string, unknown> })._rateLimitBuckets?.clear();
});

interface ReqInit {
  method?: string;
  body?: unknown;
  userId?: string;
}
function req(path: string, init: ReqInit = {}): Request {
  const { method = 'GET', body, userId = 'u1' } = init;
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = (id: string): { params: Promise<{ id: string }> } => ({ params: Promise.resolve({ id }) });

const collecting: AgentReply = { status: 'collecting', reply: 'What did you expect to happen?', missing: ['expectedBehavior'] };
const completeBug: AgentReply = {
  status: 'complete',
  reply: 'Logged your grocery-count bug.',
  record: {
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
  },
};

async function start(message = 'the grocery list is broken', userId = 'u1'): Promise<{ id: string; status: number; json: Record<string, unknown> }> {
  const res = await POST_START(req('/api/v1/feedback', { method: 'POST', body: { message }, userId }));
  const json = (await res.json()) as Record<string, unknown>;
  const feedback = json['feedback'] as { _id: string } | undefined;
  return { id: feedback?._id ?? '', status: res.status, json };
}

describe('POST /api/v1/feedback (start) — FR-F-001/002', () => {
  it('persists a draft with the user message and returns the agent question', async () => {
    sendToFeedbackAgent.mockResolvedValueOnce(collecting);
    const { id, status, json } = await start();
    expect(status).toBe(201);
    expect(json['status']).toBe('draft');
    expect(json['reply']).toMatch(/expect/i);
    const feedback = json['feedback'] as { transcript: Array<{ role: string; content: string }> };
    expect(feedback.transcript[0]).toMatchObject({ role: 'user', content: 'the grocery list is broken' });
    expect(feedback.transcript[1]).toMatchObject({ role: 'agent' });
    expect(id).toBeTruthy();
  });

  it('rejects an empty message with 400 before calling the agent', async () => {
    const res = await POST_START(req('/api/v1/feedback', { method: 'POST', body: { message: '   ' } }));
    expect(res.status).toBe(400);
    expect(sendToFeedbackAgent).not.toHaveBeenCalled();
  });

  it('preserves the draft and returns 502 when the agent fails (FR-F-002/004)', async () => {
    sendToFeedbackAgent.mockRejectedValueOnce(new Error('agent down'));
    const res = await POST_START(req('/api/v1/feedback', { method: 'POST', body: { message: 'broken thing' } }));
    expect(res.status).toBe(502);
    // The user message must still be persisted as a draft.
    const list = await GET_LIST(req('/api/v1/feedback'));
    const body = (await list.json()) as { feedback: Array<{ status: string }> };
    expect(body.feedback).toHaveLength(1);
    expect(body.feedback[0]!.status).toBe('draft');
  });
});

describe('POST /api/v1/feedback/:id/messages (continue) — FR-F-001/003/012', () => {
  it('completes the record and persists all structured fields', async () => {
    sendToFeedbackAgent.mockResolvedValueOnce(collecting);
    const { id } = await start();
    sendToFeedbackAgent.mockResolvedValueOnce(completeBug);
    const res = await POST_MSG(req(`/api/v1/feedback/${id}/messages`, { method: 'POST', body: { message: 'expected 5 got 0' } }), ctx(id));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string; feedback: Record<string, unknown> };
    expect(json.status).toBe('complete');
    expect(json.feedback).toMatchObject({ type: 'bug', affectedArea: 'grocery', priority: 'P2' });
  });

  it('refuses further messages once complete with 409 (US3-S3)', async () => {
    sendToFeedbackAgent.mockResolvedValueOnce(completeBug);
    const { id } = await start();
    const res = await POST_MSG(req(`/api/v1/feedback/${id}/messages`, { method: 'POST', body: { message: 'more' } }), ctx(id));
    expect(res.status).toBe(409);
  });

  it('finalizes the agent turn once the transcript cap is reached (FR-F-008)', async () => {
    // Seed a draft whose transcript already holds MAX_USER_TURNS user messages.
    const { FeedbackRecord } = await import('@server/models/feedback-record');
    const transcript = Array.from({ length: 30 }, (_, i) => ({ role: 'user' as const, content: `m${i}`, at: new Date() }));
    const doc = await FeedbackRecord.create({ userId: 'u1', status: 'draft', transcript });
    sendToFeedbackAgent.mockResolvedValueOnce(completeBug);
    await POST_MSG(req(`/api/v1/feedback/${doc._id}/messages`, { method: 'POST', body: { message: 'last' } }), ctx(String(doc._id)));
    expect(sendToFeedbackAgent).toHaveBeenCalledWith(expect.anything(), { finalize: true });
  });
});

describe('isolation + CRUD — FR-F-005 / SC-F-004', () => {
  it('lists only the requesting user’s records', async () => {
    sendToFeedbackAgent.mockResolvedValue(collecting);
    await start('mine', 'u1');
    await start('theirs', 'u2');
    const res = await GET_LIST(req('/api/v1/feedback', { userId: 'u1' }));
    const body = (await res.json()) as { feedback: unknown[] };
    expect(body.feedback).toHaveLength(1);
  });

  it('returns 404 for another user’s record on GET/DELETE/export (no existence leak)', async () => {
    sendToFeedbackAgent.mockResolvedValueOnce(completeBug);
    const { id } = await start('mine', 'u1');
    expect((await GET_ONE(req(`/api/v1/feedback/${id}`, { userId: 'u2' }), ctx(id))).status).toBe(404);
    expect((await DELETE_ONE(req(`/api/v1/feedback/${id}`, { method: 'DELETE', userId: 'u2' }), ctx(id))).status).toBe(404);
    expect((await GET_EXPORT(req(`/api/v1/feedback/${id}/export`, { userId: 'u2' }), ctx(id))).status).toBe(404);
  });

  it('deletes the user’s own record (204)', async () => {
    sendToFeedbackAgent.mockResolvedValueOnce(collecting);
    const { id } = await start();
    const res = await DELETE_ONE(req(`/api/v1/feedback/${id}`, { method: 'DELETE' }), ctx(id));
    expect(res.status).toBe(204);
    const get = await GET_ONE(req(`/api/v1/feedback/${id}`), ctx(id));
    expect(get.status).toBe(404);
  });
});

describe('export — FR-F-007 / US2-S2/S3', () => {
  it('serves text/markdown for a complete record', async () => {
    sendToFeedbackAgent.mockResolvedValueOnce(completeBug);
    const { id } = await start();
    const res = await GET_EXPORT(req(`/api/v1/feedback/${id}/export`), ctx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    const md = await res.text();
    expect(md).toContain('# Feature Specification: Grocery count wrong');
    expect(md).toContain('## User Scenarios & Testing');
  });

  it('refuses to export a draft with 409 (US2-S3)', async () => {
    sendToFeedbackAgent.mockResolvedValueOnce(collecting);
    const { id } = await start();
    const res = await GET_EXPORT(req(`/api/v1/feedback/${id}/export`), ctx(id));
    expect(res.status).toBe(409);
  });
});

describe('rate limiting — FR-F-009', () => {
  it('returns 429 on the 11th chat message within the window', async () => {
    sendToFeedbackAgent.mockResolvedValue(collecting);
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await POST_START(req('/api/v1/feedback', { method: 'POST', body: { message: `m${i}` } }));
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
