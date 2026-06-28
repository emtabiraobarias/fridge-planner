// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWK } from 'jose';

const ISS = 'https://issuer.test';
const AUD = 'fridge-planner';
const WEEK = '2026-06-29T00:00:00.000Z';
const WK = '2026-06-29T00%3A00%3A00.000Z';
const SLOT = '11111111-2222-3333-4444-555555555555';

let mongod: MongoMemoryServer;
let privateKey: CryptoKey;
let tokenA: string;
let tokenB: string;
// handlers
let INV: typeof import('../../app/api/v1/inventory/route');
let INV_ID: typeof import('../../app/api/v1/inventory/[id]/route');
let MP_ENTRIES: typeof import('../../app/api/v1/meal-plans/[weekStart]/entries/route');
let MP_SLOT: typeof import('../../app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route');
let GL_ITEMS: typeof import('../../app/api/v1/grocery-lists/[weekStart]/items/route');
let GL_ITEM: typeof import('../../app/api/v1/grocery-lists/[weekStart]/items/[itemId]/route');

async function mkToken(sub: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(sub).setIssuer(ISS).setAudience(AUD).setIssuedAt().setExpirationTime('10m')
    .sign(privateKey);
}

function req(token: string | null, opts: { method?: string; body?: unknown } = {}): Request {
  const { method = 'GET', body } = opts;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  return new Request('http://localhost/api/v1/x', {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const wk = (weekStart = WEEK): { params: Promise<{ weekStart: string }> } => ({ params: Promise.resolve({ weekStart }) });
const wkSlot = (slotId: string): { params: Promise<{ weekStart: string; slotId: string }> } => ({ params: Promise.resolve({ weekStart: WEEK, slotId }) });
const wkItem = (itemId: string): { params: Promise<{ weekStart: string; itemId: string }> } => ({ params: Promise.resolve({ weekStart: WEEK, itemId }) });

const ITEM = { name: 'Chicken Breast', quantity: 2, unit: 'lbs', category: 'Meat', location: 'fridge' };
const ENTRY = {
  slotId: SLOT, date: WEEK, mealType: 'dinner',
  meal: { mealName: 'M', suggestedMealType: 'dinner', prepTimeMinutes: 10, cuisine: 'x', description: 'x', usesIngredients: [], expiringIngredients: [], missingIngredients: [] },
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'oidc';
  process.env['AUTH_ISSUER'] = ISS;
  process.env['AUTH_AUDIENCE'] = AUD;

  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  const jwk = (await exportJWK(kp.publicKey)) as JWK;
  jwk.kid = 'test';
  jwk.alg = 'RS256';
  (globalThis as unknown as { _authJwks?: unknown })._authJwks = createLocalJWKSet({ keys: [jwk] });

  const db = await import('@server/db');
  await db.connectDb();
  tokenA = await mkToken('user-a');
  tokenB = await mkToken('user-b');

  INV = await import('../../app/api/v1/inventory/route');
  INV_ID = await import('../../app/api/v1/inventory/[id]/route');
  MP_ENTRIES = await import('../../app/api/v1/meal-plans/[weekStart]/entries/route');
  MP_SLOT = await import('../../app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route');
  GL_ITEMS = await import('../../app/api/v1/grocery-lists/[weekStart]/items/route');
  GL_ITEM = await import('../../app/api/v1/grocery-lists/[weekStart]/items/[itemId]/route');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('Auth enforcement (oidc) — FR-D-001/005, SC-D-001', () => {
  it('rejects a request with no token (401)', async () => {
    const res = await INV.GET(req(null));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { title: string };
    expect(body.title).toBe('Unauthorized');
  });
  it('rejects a request with a garbage token (401)', async () => {
    const res = await INV.GET(req('not-a-jwt'));
    expect(res.status).toBe(401);
  });
});

describe('Token identity drives scoping — FR-D-003, SC-D-002', () => {
  it('scopes data to the token sub; another user sees nothing', async () => {
    expect((await INV.POST(req(tokenA, { method: 'POST', body: ITEM }))).status).toBe(201);
    const aList = (await (await INV.GET(req(tokenA))).json()) as { summary: { total: number } };
    const bList = (await (await INV.GET(req(tokenB))).json()) as { summary: { total: number } };
    expect(aList.summary.total).toBe(1);
    expect(bList.summary.total).toBe(0);
  });
});

describe('No cross-user access (404) across resource types — FR-D-004/036, SC-D-002', () => {
  it('inventory: B cannot update A’s item', async () => {
    const created = (await (await INV.POST(req(tokenA, { method: 'POST', body: ITEM }))).json()) as { _id: string };
    const res = await INV_ID.PUT(req(tokenB, { method: 'PUT', body: { quantity: 9 } }), { params: Promise.resolve({ id: created._id }) });
    expect(res.status).toBe(404);
  });
  it('meal-plans: B cannot delete A’s entry', async () => {
    await MP_ENTRIES.POST(req(tokenA, { method: 'POST', body: ENTRY }), wk());
    const res = await MP_SLOT.DELETE(req(tokenB, { method: 'DELETE' }), wkSlot(SLOT));
    expect(res.status).toBe(404);
  });
  it('grocery-lists: B cannot patch A’s item', async () => {
    const list = (await (await GL_ITEMS.POST(req(tokenA, { method: 'POST', body: { displayName: 'Bread', quantity: 1, unit: 'loaf', category: 'Grains' } }), wk())).json()) as { groceryList: { items: Array<{ _id: string }> } };
    const itemId = list.groceryList.items[0]!._id;
    const res = await GL_ITEM.PATCH(req(tokenB, { method: 'PATCH', body: { isPurchased: true } }), wkItem(itemId));
    expect(res.status).toBe(404);
  });
});

void WK;
