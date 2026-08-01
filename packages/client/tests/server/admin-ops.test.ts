// @vitest-environment node
// T041–T051 — operational visibility & control (spec 011 US4: FR-AD-022/024..030).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;
let HEALTH: typeof import('../../app/api/health/route').GET;
let READY: typeof import('../../app/api/health/ready/route').GET;
let SETTINGS_GET: typeof import('../../app/api/v1/admin/settings/route').GET;
let SETTINGS_PATCH: typeof import('../../app/api/v1/admin/settings/route').PATCH;
let USAGE: typeof import('../../app/api/v1/admin/usage/route').GET;
let CACHE_DELETE: typeof import('../../app/api/v1/admin/cache/route').DELETE;
let LIMITS: typeof import('../../app/api/v1/admin/limits/route').GET;
let settings: typeof import('@server/services/runtime-settings');
let RuntimeSetting: typeof import('@server/models/runtime-setting').RuntimeSetting;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'dev';
  await (await import('@server/db')).connectDb();
  ({ GET: HEALTH } = await import('../../app/api/health/route'));
  ({ GET: READY } = await import('../../app/api/health/ready/route'));
  ({ GET: SETTINGS_GET, PATCH: SETTINGS_PATCH } =
    await import('../../app/api/v1/admin/settings/route'));
  ({ GET: USAGE } = await import('../../app/api/v1/admin/usage/route'));
  ({ DELETE: CACHE_DELETE } = await import('../../app/api/v1/admin/cache/route'));
  ({ GET: LIMITS } = await import('../../app/api/v1/admin/limits/route'));
  settings = await import('@server/services/runtime-settings');
  ({ RuntimeSetting } = await import('@server/models/runtime-setting'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await RuntimeSetting.deleteMany({});
  settings.invalidateSettingsCache();
  vi.restoreAllMocks();
});

function req(path = 'http://localhost/x', init: RequestInit = {}, roles = 'admin'): Request {
  return new Request(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-user-id': roles ? 'admin-1' : 'user-a',
      ...(roles ? { 'x-user-roles': roles } : {}),
    },
  });
}

describe('liveness stays untouched (research D8)', () => {
  // Three shipped consumers depend on this exact shape: the Docker healthcheck,
  // scripts/verify-rollout.sh, and the smoke gate. Coupling it to Mongo + two agents
  // would let a transient blip trigger a restart loop.
  it('GET /api/health returns exactly { status, version } with no dependency data', async () => {
    const body = (await (await HEALTH()).json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['status', 'version']);
    expect(body['status']).toBe('ok');
  });
});

describe('readiness (FR-AD-022/024/025)', () => {
  it('names each dependency and reports overall readiness plus version', async () => {
    const res = await READY();
    const body = (await res.json()) as {
      ready: boolean;
      version: string;
      dependencies: Array<{ name: string; status: string }>;
    };
    expect(body.dependencies.map((d) => d.name).sort()).toEqual([
      'feedback-agent',
      'meal-recommender',
      'mongodb',
      'recipe-providers',
    ]);
    expect(body.version).toBeTruthy();
    expect(typeof body.ready).toBe('boolean');
  });

  it('reports mongodb ok while connected', async () => {
    const body = (await (await READY()).json()) as {
      dependencies: Array<{ name: string; status: string }>;
    };
    expect(body.dependencies.find((d) => d.name === 'mongodb')?.status).toBe('ok');
  });

  it('marks an unreachable agent down and answers 503, still serving the request', async () => {
    process.env['HOLODECK_URL'] = 'http://127.0.0.1:9';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const res = await READY();
    const body = (await res.json()) as {
      ready: boolean;
      dependencies: Array<{ name: string; status: string }>;
    };

    expect(res.status).toBe(503); // probe can use the code…
    expect(body.dependencies.find((d) => d.name === 'meal-recommender')?.status).toBe('down'); // …human reads the detail
    expect(body.ready).toBe(false);
    delete process.env['HOLODECK_URL'];
  });

  it('is unauthenticated, like its liveness sibling', async () => {
    expect((await READY()).status).toBeLessThan(500);
  });
});

describe('runtime settings (FR-AD-030)', () => {
  it('an EMPTY collection reproduces today’s behaviour — defaults come from code', async () => {
    const res = await SETTINGS_GET(req('http://localhost/api/v1/admin/settings'));
    const { settings: values } = (await res.json()) as {
      settings: { 'ai.enabled': boolean; 'limits.recommendationsPerMinute': number };
    };
    expect(values['ai.enabled']).toBe(true);
    expect(values['limits.recommendationsPerMinute']).toBe(10); // the shipped 10/min
  });

  it('applies an override without a restart', async () => {
    const res = await SETTINGS_PATCH(
      req('http://localhost/api/v1/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ 'limits.recommendationsPerMinute': 42 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await settings.getSetting('limits.recommendationsPerMinute')).toBe(42);
  });

  it('rejects an invalid value and leaves the PRIOR value in force', async () => {
    await settings.setSetting('limits.recommendationsPerMinute', 42, 'admin-1');

    const res = await SETTINGS_PATCH(
      req('http://localhost/api/v1/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ 'limits.recommendationsPerMinute': -5 }),
      }),
    );

    expect(res.status).toBe(400);
    expect(await settings.getSetting('limits.recommendationsPerMinute')).toBe(42);
  });

  it('rejects an unknown key rather than storing junk', async () => {
    const res = await SETTINGS_PATCH(
      req('http://localhost/api/v1/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ 'not.a.setting': 1 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('refuses a non-admin', async () => {
    expect((await SETTINGS_GET(req('http://localhost/api/v1/admin/settings', {}, ''))).status).toBe(
      403,
    );
  });
});

describe('AI kill switch (FR-AD-026) + usage counting (FR-AD-027)', () => {
  it('blocks the call and returns the service’s existing fallback, not an error', async () => {
    await settings.setSetting('ai.enabled', false, 'admin-1');
    const { verifyRecipe } = await import('@server/services/recipe-verifier');
    const spy = vi.spyOn(globalThis, 'fetch');

    // null is the shipped "no verified link" outcome (FR-037) — a degradation.
    await expect(verifyRecipe('Chicken Adobo')).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('a blocked call is an UNCOUNTED call — the two can never disagree', async () => {
    const { AiUsageCounter } = await import('@server/models/ai-usage-counter');
    await AiUsageCounter.deleteMany({});
    await settings.setSetting('ai.enabled', false, 'admin-1');

    const { verifyRecipe } = await import('@server/services/recipe-verifier');
    await verifyRecipe('Chicken Adobo');

    expect(await AiUsageCounter.countDocuments({ feature: 'recipe-verify' })).toBe(0);
  });

  it('counts a permitted call', async () => {
    const { AiUsageCounter } = await import('@server/models/ai-usage-counter');
    await AiUsageCounter.deleteMany({});
    await settings.setSetting('ai.enabled', true, 'admin-1');
    const { aiAllowed } = await import('@server/lib/ai-guard');

    expect(await aiAllowed('recommendations')).toBe(true);
    await new Promise((r) => setTimeout(r, 60)); // the counter write is fire-and-forget
    const doc = await AiUsageCounter.findOne({ feature: 'recommendations' }).lean();
    expect(doc?.calls).toBeGreaterThanOrEqual(1);
  });

  it('exposes usage to an administrator only', async () => {
    expect((await USAGE(req('http://localhost/api/v1/admin/usage'))).status).toBe(200);
    expect((await USAGE(req('http://localhost/api/v1/admin/usage', {}, ''))).status).toBe(403);
  });
});

describe('cache flush + limiter control (FR-AD-028/029)', () => {
  it('flushes globally and per user, audited', async () => {
    const { AdminAuditLog } = await import('@server/models/admin-audit-log');
    await AdminAuditLog.deleteMany({});

    expect(
      (await CACHE_DELETE(req('http://localhost/api/v1/admin/cache', { method: 'DELETE' }))).status,
    ).toBe(200);
    expect(
      (
        await CACHE_DELETE(
          req('http://localhost/api/v1/admin/cache?userId=user-a', { method: 'DELETE' }),
        )
      ).status,
    ).toBe(200);

    expect(await AdminAuditLog.countDocuments({ action: 'cache.flush' })).toBe(2);
  });

  it('shows limiter state and clears a bucket', async () => {
    const { rateLimit, resetLimiterKey, inspectLimiter } = await import('@server/rate-limit');
    rateLimit('demo:user-a', 5, 60_000);
    expect(inspectLimiter().some((b) => b.key === 'demo:user-a')).toBe(true);

    const res = await LIMITS(req('http://localhost/api/v1/admin/limits'));
    const { buckets } = (await res.json()) as { buckets: Array<{ key: string }> };
    expect(buckets.some((b) => b.key === 'demo:user-a')).toBe(true);

    expect(resetLimiterKey('demo:user-a')).toBe(true);
    expect(inspectLimiter().some((b) => b.key === 'demo:user-a')).toBe(false);
  });
});
