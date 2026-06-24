// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const WEEK_START = '2026-04-06T00:00:00.000Z';
const USER = 'user-a';

function entry(slotId: string, usesIngredients: string[], mealName = 'Meal'): Record<string, unknown> {
  return {
    slotId,
    date: '2026-04-06T00:00:00.000Z',
    mealType: 'dinner',
    meal: {
      mealName,
      suggestedMealType: 'dinner',
      prepTimeMinutes: 20,
      cuisine: 'American',
      description: 'Tasty.',
      usesIngredients,
      expiringIngredients: [],
      missingIngredients: [],
    },
  };
}

const SLOT_A = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SLOT_B = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

let mongod: MongoMemoryServer;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let GET: typeof import('../../app/api/v1/meal-plans/route').GET;
let PUT: typeof import('../../app/api/v1/meal-plans/[weekStart]/route').PUT;
let ADD_ENTRY: typeof import('../../app/api/v1/meal-plans/[weekStart]/entries/route').POST;
let DELETE_ENTRY: typeof import('../../app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route').DELETE;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ GET } = await import('../../app/api/v1/meal-plans/route'));
  ({ PUT } = await import('../../app/api/v1/meal-plans/[weekStart]/route'));
  ({ POST: ADD_ENTRY } = await import('../../app/api/v1/meal-plans/[weekStart]/entries/route'));
  ({ DELETE: DELETE_ENTRY } = await import('../../app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

function getReq(weekStart: string | null): Request {
  const url =
    weekStart === null
      ? 'http://localhost/api/v1/meal-plans'
      : `http://localhost/api/v1/meal-plans?weekStart=${encodeURIComponent(weekStart)}`;
  return new Request(url, { headers: { 'x-user-id': USER } });
}

function bodyReq(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/v1/meal-plans', {
    method,
    headers: { 'content-type': 'application/json', 'x-user-id': USER },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function wk(weekStart = WEEK_START): { params: Promise<{ weekStart: string }> } {
  return { params: Promise.resolve({ weekStart }) };
}

function wkSlot(slotId: string, weekStart = WEEK_START): { params: Promise<{ weekStart: string; slotId: string }> } {
  return { params: Promise.resolve({ weekStart, slotId }) };
}

async function seedInv(name: string, quantity: number): Promise<void> {
  await InventoryItem.create({ userId: USER, name, quantity, unit: 'units', category: 'Meat', location: 'fridge' });
}

async function invQty(name: string): Promise<number | null> {
  const item = await InventoryItem.findOne({ userId: USER, name });
  return item?.quantity ?? null;
}

describe('GET /api/v1/meal-plans', () => {
  it('returns 400 when weekStart is missing', async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid weekStart', async () => {
    const res = await GET(getReq('not-a-date'));
    expect(res.status).toBe(400);
  });

  it('returns { plan: null } when no plan exists', async () => {
    const res = await GET(getReq(WEEK_START));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { plan: unknown }).plan).toBeNull();
  });

  it('returns the plan after an entry is added', async () => {
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, [])), wk());
    const res = await GET(getReq(WEEK_START));
    const { plan } = (await res.json()) as { plan: { entries: unknown[] } };
    expect(plan.entries).toHaveLength(1);
  });
});

describe('POST /api/v1/meal-plans/[weekStart]/entries — consumes ingredients (BUG #7)', () => {
  it('adds an entry (201) and decrements the used ingredient', async () => {
    await seedInv('Chicken Breast', 3);
    const res = await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast'])), wk());
    expect(res.status).toBe(201);
    expect(await invQty('Chicken Breast')).toBe(2);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await ADD_ENTRY(bodyReq('POST', { slotId: 'not-a-uuid' }), wk());
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid weekStart', async () => {
    const res = await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, [])), wk('not-a-date'));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/v1/meal-plans/[weekStart]/entries/[slotId] — restores ingredients (BUG #7)', () => {
  it('removes the entry and restores the used ingredient', async () => {
    await seedInv('Chicken Breast', 3);
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast'])), wk());
    expect(await invQty('Chicken Breast')).toBe(2);

    const res = await DELETE_ENTRY(bodyReq('DELETE'), wkSlot(SLOT_A));
    expect(res.status).toBe(200);
    expect(await invQty('Chicken Breast')).toBe(3);
  });

  it('returns 404 for a non-existent slotId', async () => {
    const res = await DELETE_ENTRY(bodyReq('DELETE'), wkSlot(SLOT_B));
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/meal-plans/[weekStart] — net-diffs ingredients (BUG #7)', () => {
  it('restores the old set and consumes the new set on replace', async () => {
    await seedInv('Chicken Breast', 3);
    await seedInv('Rice', 3);
    // Plan with a chicken meal → chicken 3→2
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast'])), wk());
    expect(await invQty('Chicken Breast')).toBe(2);

    // Replace the whole plan with a rice meal → restore chicken (2→3), consume rice (3→2)
    const res = await PUT(bodyReq('PUT', { entries: [entry(SLOT_B, ['Rice'])] }), wk());
    expect(res.status).toBe(200);
    expect(await invQty('Chicken Breast')).toBe(3);
    expect(await invQty('Rice')).toBe(2);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await PUT(bodyReq('PUT', { entries: [{ slotId: 'nope' }] }), wk());
    expect(res.status).toBe(400);
  });
});
