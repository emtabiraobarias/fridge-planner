// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * US3 — requirements are drafted and vetted before work starts.
 *
 * The agent is stubbed at `global.fetch`, per CLAUDE.md §8's agent-client convention. That is
 * also the only option right now: the live agent cannot complete a turn (the OpenAI account has
 * no credits), so these assert the CONTRACT with the agent rather than the agent itself.
 */

let mongod: MongoMemoryServer;
let LifecycleItem: typeof import('@server/models/lifecycle-item').LifecycleItem;
let FeedbackRecord: typeof import('@server/models/feedback-record').FeedbackRecord;
let ITEM: typeof import('../../app/api/v1/admin/lifecycle/[id]/route');
let CLAUSES: typeof import('../../app/api/v1/admin/lifecycle/[id]/clauses/route');
let VET: typeof import('../../app/api/v1/admin/lifecycle/[id]/clauses/[provisionalId]/route');
let resetLimiterKey: typeof import('@server/rate-limit').resetLimiterKey;

const ADMIN = 'admin-1';
const REPORTER = 'reporter-1';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'dev';
  process.env['FEEDBACK_AGENT_URL'] = 'http://agent.test';
  const db = await import('@server/db');
  await db.connectDb();
  ({ LifecycleItem } = await import('@server/models/lifecycle-item'));
  ({ FeedbackRecord } = await import('@server/models/feedback-record'));
  ({ resetLimiterKey } = await import('@server/rate-limit'));
  ITEM = await import('../../app/api/v1/admin/lifecycle/[id]/route');
  CLAUSES = await import('../../app/api/v1/admin/lifecycle/[id]/clauses/route');
  VET = await import('../../app/api/v1/admin/lifecycle/[id]/clauses/[provisionalId]/route');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([LifecycleItem.deleteMany({}), FeedbackRecord.deleteMany({})]);
  vi.restoreAllMocks();
  // Module-level limiter state survives between tests — without this the Nth call 429s and the
  // assertion checks an action that never happened (CLAUDE.md §8).
  resetLimiterKey(`feedback-chat:${ADMIN}`);
});

function admin(method: string, body?: unknown): Request {
  return new Request('http://localhost:3000/api/v1/admin/lifecycle', {
    method,
    headers: { 'x-user-id': ADMIN, 'x-user-roles': 'admin', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});
const vctx = (
  id: string,
  provisionalId: string,
): { params: Promise<{ id: string; provisionalId: string }> } => ({
  params: Promise.resolve({ id, provisionalId }),
});

/** Stub the agent's HTTP reply. */
function stubAgent(content: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      text: async () => 'err',
      json: async () => ({
        content: typeof content === 'string' ? content : JSON.stringify(content),
        session_id: 's',
        tool_calls: [],
        tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        execution_time_ms: 1,
      }),
    }),
  );
}

const TWO_CLAUSES = {
  status: 'clauses',
  clauses: [
    {
      text: 'When a grocery row is checked off, the system shall not duplicate it.',
      derivedFrom: 'rows duplicate after checkout',
      inferred: false,
    },
    {
      text: 'While a refresh is in flight, the system shall keep the list stable.',
      derivedFrom: 'and then refresh the page',
      inferred: true,
    },
  ],
};

let seq = 0;
async function seed(stage = 'briefed', over: Record<string, unknown> = {}): Promise<string> {
  const rec = await FeedbackRecord.create({
    userId: REPORTER,
    status: 'complete',
    type: 'bug',
    title: 'Grocery rows duplicate',
    problemStatement: 'rows duplicate after checkout and then refresh the page',
    transcript: [{ role: 'user', content: 'rows duplicate', at: new Date() }],
  });
  const doc = await LifecycleItem.create({
    userId: REPORTER,
    feedbackRecordId: String(rec._id),
    sourceTitle: 'Grocery rows duplicate',
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    stage,
    ...over,
  });
  seq++;
  return String(doc._id);
}

describe('US3 — clause drafting', () => {
  it('drafts clauses from the record at briefed (FR-FL-024)', async () => {
    stubAgent(TWO_CLAUSES);
    const id = await seed();
    const res = await CLAUSES.POST(admin('POST', {}), ctx(id));
    expect(res.status).toBe(200);

    const item = await LifecycleItem.findById(id).lean();
    expect(item!.clauses).toHaveLength(2);
  });

  it('keeps the record text each clause came from (FR-FL-025)', async () => {
    stubAgent(TWO_CLAUSES);
    const id = await seed();
    await CLAUSES.POST(admin('POST', {}), ctx(id));
    const item = await LifecycleItem.findById(id).lean();
    // Vetting is a COMPARISON. A clause with nothing to compare against degrades into a
    // proofread, and well-formed EARS is easy to accept uncritically.
    expect(item!.clauses.every((c) => c.derivedFrom.length > 0)).toBe(true);
  });

  it('marks a clause whose content was inferred (FR-FL-026)', async () => {
    stubAgent(TWO_CLAUSES);
    const id = await seed();
    await CLAUSES.POST(admin('POST', {}), ctx(id));
    const item = await LifecycleItem.findById(id).lean();
    expect(item!.clauses.map((c) => c.inferred)).toEqual([false, true]);
  });

  it('assigns provisional ids, never a real FR- number (FR-FL-027)', async () => {
    stubAgent(TWO_CLAUSES);
    const id = await seed();
    await CLAUSES.POST(admin('POST', {}), ctx(id));
    const item = await LifecycleItem.findById(id).lean();
    expect(item!.clauses.map((c) => c.provisionalId)).toEqual(['C-01', 'C-02']);
    expect(item!.clauses.some((c) => c.provisionalId.startsWith('FR-'))).toBe(false);
  });

  it('starts every drafted clause as pending — a draft has no authority (FR-FL-030)', async () => {
    stubAgent(TWO_CLAUSES);
    const id = await seed();
    await CLAUSES.POST(admin('POST', {}), ctx(id));
    const item = await LifecycleItem.findById(id).lean();
    expect(item!.clauses.every((c) => c.vetted === 'pending')).toBe(true);
  });

  // FR-FL-028 / SC-FL-005 — the gate that makes `briefed` a real stage.
  it('REFUSES advance to in-spec while any clause is pending (FR-FL-028)', async () => {
    stubAgent(TWO_CLAUSES);
    const id = await seed();
    await CLAUSES.POST(admin('POST', {}), ctx(id));

    const blocked = await ITEM.PATCH(admin('PATCH', { action: 'advance' }), ctx(id));
    expect(blocked.status).toBe(409);
    expect((await LifecycleItem.findById(id).lean())!.stage).toBe('briefed');

    await VET.PATCH(admin('PATCH', { vetted: 'accepted' }), vctx(id, 'C-01'));
    // Still one pending — one vetted clause is not enough.
    expect((await ITEM.PATCH(admin('PATCH', { action: 'advance' }), ctx(id))).status).toBe(409);

    await VET.PATCH(admin('PATCH', { vetted: 'rejected' }), vctx(id, 'C-02'));
    const ok = await ITEM.PATCH(admin('PATCH', { action: 'advance' }), ctx(id));
    // A REJECTED clause counts as vetted — the maintainer looked at it and said no.
    expect(ok.status).toBe(200);
    expect((await ok.json()).stage).toBe('in-spec');
  });

  it('records who vetted each clause and when (FR-FL-029)', async () => {
    stubAgent(TWO_CLAUSES);
    const id = await seed();
    await CLAUSES.POST(admin('POST', {}), ctx(id));
    await VET.PATCH(admin('PATCH', { vetted: 'accepted', editedText: 'Tighter wording.' }), vctx(id, 'C-01'));

    const item = await LifecycleItem.findById(id).lean();
    const c = item!.clauses.find((x) => x.provisionalId === 'C-01')!;
    expect(c.vetted).toBe('accepted');
    expect(c.vettedBy).toBe(ADMIN);
    expect(c.editedText).toBe('Tighter wording.');
  });

  // FR-FL-031 — drafting is an ASSIST, never a precondition.
  it('lets the maintainer author a clause when drafting yields nothing (FR-FL-031)', async () => {
    stubAgent({ status: 'collecting', reply: 'hm', missing: [] }); // agent does not know this mode
    const id = await seed();
    const drafted = await CLAUSES.POST(admin('POST', {}), ctx(id));
    expect(drafted.status).toBe(200);
    expect((await LifecycleItem.findById(id).lean())!.clauses).toHaveLength(0);

    const manual = await CLAUSES.POST(
      admin('POST', { text: 'The system shall collapse duplicate rows.', derivedFrom: 'rows duplicate' }),
      ctx(id),
    );
    expect(manual.status).toBe(200);

    const item = await LifecycleItem.findById(id).lean();
    expect(item!.clauses).toHaveLength(1);
    // The maintainer wrote it, so there is nothing to vet it against.
    expect(item!.clauses[0]!.vetted).toBe('accepted');
  });

  it('degrades to no clauses when the agent is unreachable, never blocking (FR-FL-031)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const id = await seed();
    const res = await CLAUSES.POST(admin('POST', {}), ctx(id));
    // The item stays at `briefed` and the maintainer writes them by hand — the agent being
    // down must not strand work.
    expect(res.status).toBe(200);
    expect((await res.json()).drafted).toBe(0);
  });

  it('drafts only at briefed', async () => {
    stubAgent(TWO_CLAUSES);
    const id = await seed('accepted');
    const res = await CLAUSES.POST(admin('POST', {}), ctx(id));
    expect(res.status).toBe(409);
  });

  it('refuses a non-admin (FR-FL-054)', async () => {
    const id = await seed();
    const res = await CLAUSES.POST(
      new Request('http://localhost:3000/x', {
        method: 'POST',
        headers: { 'x-user-id': REPORTER, 'content-type': 'application/json' },
        body: '{}',
      }),
      ctx(id),
    );
    expect(res.status).toBe(403);
  });
});
