// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Route handlers are imported dynamically in beforeAll, AFTER MONGODB_URI is set,
// because src/server/db.ts captures the URI at module-evaluation time.
let mongod: MongoMemoryServer;
let GET: typeof import('../../app/api/v1/inventory/route').GET;
let POST: typeof import('../../app/api/v1/inventory/route').POST;
let PUT: typeof import('../../app/api/v1/inventory/[id]/route').PUT;
let DELETE: typeof import('../../app/api/v1/inventory/[id]/route').DELETE;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ GET, POST } = await import('../../app/api/v1/inventory/route'));
  ({ PUT, DELETE } = await import('../../app/api/v1/inventory/[id]/route'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
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

const validItem = {
  name: 'Chicken Breast',
  quantity: 2,
  unit: 'lbs',
  category: 'Meat',
  location: 'fridge',
};

async function create(overrides: Record<string, unknown> = {}, userId = 'u1'): Promise<string> {
  const res = await POST(req('/api/v1/inventory', { method: 'POST', body: { ...validItem, ...overrides }, userId }));
  const json = (await res.json()) as { _id: string };
  return json._id;
}

describe('Route Handler: POST /api/v1/inventory', () => {
  it('creates an item and computes expirationStatus from expiresAt', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const res = await POST(
      req('/api/v1/inventory', { method: 'POST', body: { ...validItem, expiresAt: tomorrow.toISOString() } }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { name: string; expirationStatus: string };
    expect(json.name).toBe('Chicken Breast');
    expect(json.expirationStatus).toBe('expiring-soon');
  });

  it('rejects invalid input with a 400 Problem JSON', async () => {
    const res = await POST(req('/api/v1/inventory', { method: 'POST', body: { name: '' } }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { title: string; status: number };
    expect(json.title).toBe('Invalid input');
    expect(json.status).toBe(400);
  });
});

describe('Route Handler: GET /api/v1/inventory', () => {
  it('returns only the requesting user’s items (FR-036 isolation)', async () => {
    await create({ name: 'Mine' }, 'u1');
    await create({ name: 'Theirs' }, 'u2');

    const res = await GET(req('/api/v1/inventory', { userId: 'u1' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: Array<{ name: string }>; summary: { total: number }; pagination: { page: number } };
    expect(json.items.map((i) => i.name)).toEqual(['Mine']);
    expect(json.summary.total).toBe(1);
    expect(json.pagination.page).toBe(1);
  });

  it('derives ?status=expired from expiresAt, not the persisted field (BUG #6)', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await create({ name: 'Old Milk', category: 'Dairy', expiresAt: yesterday.toISOString() });
    await create({ name: 'Fresh' });

    const res = await GET(req('/api/v1/inventory?status=expired'));
    const json = (await res.json()) as { items: Array<{ name: string; expirationStatus: string }> };
    expect(json.items.map((i) => i.name)).toEqual(['Old Milk']);
    expect(json.items[0]?.expirationStatus).toBe('expired');
  });
});

describe('Route Handler: PUT /api/v1/inventory/[id]', () => {
  it('updates the owner’s item', async () => {
    const id = await create();
    const res = await PUT(req(`/api/v1/inventory/${id}`, { method: 'PUT', body: { quantity: 5 } }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { quantity: number };
    expect(json.quantity).toBe(5);
  });

  it('updates location and expiry, recomputing expirationStatus (FR-002 / FR-UI-019 revised)', async () => {
    const id = await create();
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const res = await PUT(
      req(`/api/v1/inventory/${id}`, { method: 'PUT', body: { location: 'freezer', expiresAt: tomorrow } }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { location: string; expiresAt: string; expirationStatus: string };
    expect(json.location).toBe('freezer');
    expect(json.expiresAt).toBeTruthy();
    // Recomputed by the model pre-hook, never set by the controller (CLAUDE.md §14).
    expect(json.expirationStatus).toBe('expiring-soon');
  });

  it('clears the expiry with expiresAt:null → status "none" (FR-002 / FR-UI-019 revised)', async () => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const id = await create({ expiresAt: tomorrow });
    const res = await PUT(
      req(`/api/v1/inventory/${id}`, { method: 'PUT', body: { expiresAt: null, location: 'pantry' } }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { location: string; expiresAt?: string; expirationStatus: string };
    expect(json.expiresAt).toBeUndefined();
    expect(json.expirationStatus).toBe('none');
    expect(json.location).toBe('pantry');
  });

  it('returns 404 when updating another user’s item (isolation)', async () => {
    const id = await create({}, 'u2');
    const res = await PUT(req(`/api/v1/inventory/${id}`, { method: 'PUT', body: { quantity: 5 }, userId: 'u1' }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for a malformed ObjectId', async () => {
    const res = await PUT(req('/api/v1/inventory/not-an-id', { method: 'PUT', body: { quantity: 5 } }), {
      params: Promise.resolve({ id: 'not-an-id' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('Route Handler: DELETE /api/v1/inventory/[id]', () => {
  it('deletes the owner’s item with 204', async () => {
    const id = await create();
    const res = await DELETE(req(`/api/v1/inventory/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(204);
  });

  it('returns 404 when deleting another user’s item (isolation)', async () => {
    const id = await create({}, 'u2');
    const res = await DELETE(req(`/api/v1/inventory/${id}`, { method: 'DELETE', userId: 'u1' }), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(404);
  });
});
