// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * US5 — the maintainer closes the loop.
 *
 * The property under test throughout: **closure is never gated on GitHub** (FR-FL-045). Every
 * failure mode of the release list must still leave an item closable.
 */

let mongod: MongoMemoryServer;
let LifecycleItem: typeof import('@server/models/lifecycle-item').LifecycleItem;
let ITEM: typeof import('../../app/api/v1/admin/lifecycle/[id]/route');
let OWN: typeof import('../../app/api/v1/lifecycle/[id]/route');
let RELEASES: typeof import('../../app/api/v1/admin/releases/route');
let fetchReleases: typeof import('@server/services/release-list').fetchReleases;
let resetReleaseCache: typeof import('@server/services/release-list').resetReleaseCache;

const ADMIN = 'admin-1';
const REPORTER = 'reporter-1';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'dev';
  process.env['GITHUB_REPO'] = 'owner/repo';
  const db = await import('@server/db');
  await db.connectDb();
  ({ LifecycleItem } = await import('@server/models/lifecycle-item'));
  ({ fetchReleases, resetReleaseCache } = await import('@server/services/release-list'));
  ITEM = await import('../../app/api/v1/admin/lifecycle/[id]/route');
  OWN = await import('../../app/api/v1/lifecycle/[id]/route');
  RELEASES = await import('../../app/api/v1/admin/releases/route');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await LifecycleItem.deleteMany({});
  resetReleaseCache();
  vi.restoreAllMocks();
  process.env['GITHUB_REPO'] = 'owner/repo';
});

function admin(body?: unknown): Request {
  return new Request('http://localhost:3000/api/v1/admin/lifecycle', {
    method: body ? 'PATCH' : 'GET',
    headers: { 'x-user-id': ADMIN, 'x-user-roles': 'admin', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
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

function stubGitHub(payload: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 503, json: async () => payload }),
  );
}

describe('release list (D17)', () => {
  it('lists published releases', async () => {
    stubGitHub([
      { tag_name: 'nextjs-v4.14.2', name: 'Admin UI', html_url: 'https://x/1', published_at: '2026-08-24' },
    ]);
    const list = await fetchReleases();
    expect(list.available).toBe(true);
    expect(list.releases[0]!.tag).toBe('nextjs-v4.14.2');
  });

  it('omits drafts — closure points a reporter at something they can actually see', async () => {
    stubGitHub([
      { tag_name: 'v2', html_url: 'https://x/2', draft: true },
      { tag_name: 'v1', html_url: 'https://x/1' },
    ]);
    const list = await fetchReleases();
    expect(list.releases.map((r) => r.tag)).toEqual(['v1']);
  });

  it('caches, so closing several items does not hammer a third party (FR-FL-046)', async () => {
    stubGitHub([{ tag_name: 'v1', html_url: 'https://x/1' }]);
    await fetchReleases();
    await fetchReleases();
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
  });

  it('reports unavailability as a NORMAL answer, never a throw (FR-FL-044)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const list = await fetchReleases();
    expect(list.available).toBe(false);
    expect(list.unavailableReason).toMatch(/unreachable/i);
    expect(list.releases).toEqual([]);
  });

  it('treats an unset repo as unavailable, not an error', async () => {
    delete process.env['GITHUB_REPO'];
    const list = await fetchReleases();
    expect(list.available).toBe(false);
  });

  it('the endpoint returns 200 even when GitHub is down (FR-FL-045)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const res = await RELEASES.GET(admin());
    // A 503 would push the client into an error path it must not take — closure has to proceed.
    expect(res.status).toBe(200);
    expect((await res.json()).available).toBe(false);
  });

  it('refuses a non-admin', async () => {
    const res = await RELEASES.GET(
      new Request('http://localhost:3000/api/v1/admin/releases', {
        headers: { 'x-user-id': REPORTER },
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe('US5 — closure', () => {
  it('closes a shipped item with an excerpt and a release (FR-FL-040/041)', async () => {
    const id = await seed('shipped');
    const res = await ITEM.PATCH(
      admin({
        action: 'close',
        excerpt: 'Duplicate rows no longer appear after checkout.',
        releaseTag: 'nextjs-v4.15.0',
        releaseUrl: 'https://github.com/x/releases/v4.15.0',
      }),
      ctx(id),
    );
    expect(res.status).toBe(200);
    const item = await LifecycleItem.findById(id).lean();
    expect(item!.stage).toBe('closed');
    expect(item!.closure!.releaseTag).toBe('nextjs-v4.15.0');
    expect(item!.closure!.closedBy).toBe(ADMIN);
  });

  it('permits closure only from shipped (FR-FL-040)', async () => {
    for (const stage of ['new', 'accepted', 'in-progress', 'in-review']) {
      const id = await seed(stage);
      const res = await ITEM.PATCH(admin({ action: 'close', excerpt: 'x' }), ctx(id));
      expect(res.status, stage).toBe(409);
    }
  });

  it('requires an excerpt — the reporter is owed words, not just a tag (FR-FL-042)', async () => {
    const id = await seed('shipped');
    const res = await ITEM.PATCH(admin({ action: 'close', releaseTag: 'v1' }), ctx(id));
    expect(res.status).toBe(400);
    expect((await LifecycleItem.findById(id).lean())!.stage).toBe('shipped');
  });

  // SC-FL-008 — the property the whole D17 design is shaped around.
  it('CLOSES SUCCESSFULLY with the release list unavailable (FR-FL-044, SC-FL-008)', async () => {
    const id = await seed('shipped');
    const res = await ITEM.PATCH(
      admin({
        action: 'close',
        excerpt: 'Fixed.',
        releaseFallbackText: 'shipped in the 25 Aug release',
        unavailableReason: 'The release list is unreachable.',
      }),
      ctx(id),
    );
    expect(res.status).toBe(200);
    const item = await LifecycleItem.findById(id).lean();
    expect(item!.stage).toBe('closed');
    expect(item!.closure!.releaseFallbackText).toBeTruthy();
    // Recorded, so a closure written during an outage is distinguishable from a careless one.
    expect(item!.closure!.unavailableReason).toMatch(/unreachable/i);
  });

  it('refuses every transition out of closed (FR-FL-049)', async () => {
    const id = await seed('shipped');
    await ITEM.PATCH(admin({ action: 'close', excerpt: 'Fixed.' }), ctx(id));
    for (const action of ['advance', 'park', 'reopen', 'approve-release']) {
      const res = await ITEM.PATCH(admin({ action }), ctx(id));
      expect(res.status, action).toBe(409);
    }
  });

  it('cites a closed item without moving it (FR-FL-050/051)', async () => {
    const closed = await seed('shipped');
    await ITEM.PATCH(admin({ action: 'close', excerpt: 'Fixed.' }), ctx(closed));
    const recurrence = await seed('new');

    const res = await ITEM.PATCH(admin({ action: 'cite', citedId: closed }), ctx(recurrence));
    expect(res.status).toBe(200);

    // A recurrence CITES; it never resurrects. Both items stay exactly where they were.
    expect((await LifecycleItem.findById(recurrence).lean())!.cites).toContain(closed);
    expect((await LifecycleItem.findById(recurrence).lean())!.stage).toBe('new');
    expect((await LifecycleItem.findById(closed).lean())!.stage).toBe('closed');
  });

  it('shows the reporter the excerpt and the release (FR-FL-048)', async () => {
    const id = await seed('shipped');
    await ITEM.PATCH(
      admin({
        action: 'close',
        excerpt: 'Duplicate rows no longer appear.',
        releaseTag: 'nextjs-v4.15.0',
        releaseUrl: 'https://github.com/x/releases/v4.15.0',
      }),
      ctx(id),
    );

    const res = await OWN.GET(
      new Request('http://localhost:3000/api/v1/lifecycle', { headers: { 'x-user-id': REPORTER } }),
      ctx(id),
    );
    const body = (await res.json()) as { closure?: { excerpt: string; releaseTag?: string } };
    expect(body.closure?.excerpt).toBe('Duplicate rows no longer appear.');
    expect(body.closure?.releaseTag).toBe('nextjs-v4.15.0');
  });
});
