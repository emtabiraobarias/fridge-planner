// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Route handlers are imported dynamically in beforeAll, AFTER MONGODB_URI is set,
// because src/server/db.ts captures the URI at module-evaluation time.
let mongod: MongoMemoryServer;
let GET: typeof import('../../app/api/v1/quick-add/aliases/route').GET;
let PUT: typeof import('../../app/api/v1/quick-add/aliases/[nameKey]/route').PUT;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ GET } = await import('../../app/api/v1/quick-add/aliases/route'));
  ({ PUT } = await import('../../app/api/v1/quick-add/aliases/[nameKey]/route'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

function req(init: { method?: string; body?: unknown; userId?: string | null } = {}): Request {
  const { method = 'GET', body, userId = 'u1' } = init;
  return new Request('http://localhost/api/v1/quick-add/aliases', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(userId ? { 'x-user-id': userId } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function putCtx(nameKey: string): { params: Promise<{ nameKey: string }> } {
  return { params: Promise.resolve({ nameKey }) };
}

async function putAlias(
  nameKey: string,
  body: unknown,
  userId = 'u1',
): Promise<Response> {
  return PUT(req({ method: 'PUT', body, userId }), putCtx(nameKey));
}

async function getAliases(userId = 'u1'): Promise<{ aliases: Record<string, unknown>[] }> {
  const res = await GET(req({ userId }));
  expect(res.status).toBe(200);
  return (await res.json()) as { aliases: Record<string, unknown>[] };
}

describe('GET /api/v1/quick-add/aliases (FR-IQ-015/018)', () => {
  it('returns an empty list for a user with no aliases', async () => {
    const data = await getAliases();
    expect(data.aliases).toEqual([]);
  });

  // 401 semantics are exercised centrally in auth.handlers.test.ts (OIDC mode);
  // these handlers use the same authenticate()+withRoute path.
});

describe('PUT /api/v1/quick-add/aliases/:nameKey (FR-IQ-015..018)', () => {
  it('upserts learned fields and returns the stored alias', async () => {
    const res = await putAlias('tortillas', { category: 'Grains', location: 'pantry' });
    expect(res.status).toBe(200);
    const { alias } = (await res.json()) as { alias: Record<string, unknown> };
    expect(alias).toMatchObject({ nameKey: 'tortillas', category: 'Grains', location: 'pantry' });

    const data = await getAliases();
    expect(data.aliases).toHaveLength(1);
    expect(data.aliases[0]).toMatchObject({ nameKey: 'tortillas', location: 'pantry' });
  });

  it('overwrites a re-corrected field instead of accumulating', async () => {
    await putAlias('tortillas', { location: 'pantry' });
    await putAlias('tortillas', { location: 'freezer' });
    const data = await getAliases();
    expect(data.aliases[0]).toMatchObject({ location: 'freezer' });
  });

  it('normalises the nameKey (case/whitespace)', async () => {
    await putAlias('  Oat Milk ', { unit: 'L' });
    await putAlias('oat milk', { location: 'fridge' });
    const data = await getAliases();
    expect(data.aliases).toHaveLength(1);
    expect(data.aliases[0]).toMatchObject({ nameKey: 'oat milk', unit: 'L', location: 'fridge' });
  });

  it('rejects a non-enum category/location and an empty body (400)', async () => {
    expect((await putAlias('x', { category: 'Sweets' })).status).toBe(400);
    expect((await putAlias('x', { location: 'garage' })).status).toBe(400);
    expect((await putAlias('x', { unit: 'hogshead' })).status).toBe(400);
    expect((await putAlias('x', {})).status).toBe(400);
  });

  it('records shelf-life observations FIFO-capped at 5 and suggests the median at ≥2', async () => {
    // One observation → no suggestion yet (FR-IQ-017 guard).
    await putAlias('salad mix', { observedShelfLifeDays: 9 });
    let data = await getAliases();
    expect(data.aliases[0]!['suggestedShelfLifeDays']).toBeUndefined();

    // Second observation → median of [9, 3] = 6.
    await putAlias('salad mix', { observedShelfLifeDays: 3 });
    data = await getAliases();
    expect(data.aliases[0]).toMatchObject({ suggestedShelfLifeDays: 6 });

    // Six more distinct values → only the newest five [4,5,6,7,8] count → median 6.
    for (const n of [2, 4, 5, 6, 7, 8]) {
      await putAlias('salad mix', { observedShelfLifeDays: n });
    }
    data = await getAliases();
    expect(data.aliases[0]).toMatchObject({ suggestedShelfLifeDays: 6 });
  });

  it('rejects out-of-range observations (400)', async () => {
    expect((await putAlias('x', { observedShelfLifeDays: -1 })).status).toBe(400);
    expect((await putAlias('x', { observedShelfLifeDays: 400 })).status).toBe(400);
    expect((await putAlias('x', { observedShelfLifeDays: 2.5 })).status).toBe(400);
  });

  it('isolates aliases per user (FR-036 / FR-IQ-018)', async () => {
    await putAlias('tortillas', { location: 'pantry' }, 'userA');
    const dataB = await getAliases('userB');
    expect(dataB.aliases).toEqual([]);
  });
});
