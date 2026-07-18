// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const WEEK_START = '2026-04-06T00:00:00.000Z';
const USER = 'user-a';

// Spy on recs-cache invalidation (FR-MC-010) while keeping the real implementation.
const { invalidateUserSpy } = vi.hoisted(() => ({ invalidateUserSpy: vi.fn() }));
vi.mock('@server/services/recommendations-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@server/services/recommendations-cache')>();
  return {
    ...actual,
    invalidateUser: (userId: string): void => {
      invalidateUserSpy(userId);
      actual.invalidateUser(userId);
    },
  };
});

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
let MealPlan: typeof import('@server/models/meal-plan').MealPlan;
let GET: typeof import('../../app/api/v1/meal-plans/route').GET;
let PUT: typeof import('../../app/api/v1/meal-plans/[weekStart]/route').PUT;
let ADD_ENTRY: typeof import('../../app/api/v1/meal-plans/[weekStart]/entries/route').POST;
let DELETE_ENTRY: typeof import('../../app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route').DELETE;
let PATCH_ENTRY: typeof import('../../app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route').PATCH;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ MealPlan } = await import('@server/models/meal-plan'));
  ({ GET } = await import('../../app/api/v1/meal-plans/route'));
  ({ PUT } = await import('../../app/api/v1/meal-plans/[weekStart]/route'));
  ({ POST: ADD_ENTRY } = await import('../../app/api/v1/meal-plans/[weekStart]/entries/route'));
  ({ DELETE: DELETE_ENTRY, PATCH: PATCH_ENTRY } = await import(
    '../../app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route'
  ));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  invalidateUserSpy.mockClear();
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

async function seedInv(name: string, quantity: number, unit = 'units'): Promise<string> {
  const item = await InventoryItem.create({ userId: USER, name, quantity, unit, category: 'Meat', location: 'fridge' });
  return String(item._id);
}

async function invQty(name: string): Promise<number | null> {
  const item = await InventoryItem.findOne({ userId: USER, name });
  return item?.quantity ?? null;
}

function cookBody(lines: Array<Record<string, unknown>>): Record<string, unknown> {
  return { action: 'cook', consumption: lines };
}

interface StoredEntry {
  slotId: string;
  status?: string;
  cookedAt?: string;
  consumedItems?: Array<{ name: string; quantityConsumed: number }>;
}

async function storedEntries(): Promise<StoredEntry[]> {
  const plan = await MealPlan.findOne({ userId: USER });
  return JSON.parse(JSON.stringify(plan?.entries ?? [])) as StoredEntry[];
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
});

describe('POST entries — planning never touches inventory (FR-MC-006)', () => {
  it('adds the entry as planned and leaves inventory unchanged', async () => {
    await seedInv('Chicken Breast', 3);
    const res = await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast'])), wk());
    expect(res.status).toBe(201);
    expect(await invQty('Chicken Breast')).toBe(3);
    const [stored] = await storedEntries();
    expect(stored!.status).toBe('planned');
  });

  it('ignores client-sent lifecycle fields (cannot cook via POST)', async () => {
    await seedInv('Chicken Breast', 3);
    const forged = { ...entry(SLOT_A, ['Chicken Breast']), status: 'cooked', consumedItems: [] };
    const res = await ADD_ENTRY(bodyReq('POST', forged), wk());
    expect(res.status).toBe(201);
    const [stored] = await storedEntries();
    expect(stored!.status).toBe('planned');
    expect(stored!.consumedItems).toBeUndefined();
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

describe('DELETE entries — no inventory side-effects (FR-MC-006/014)', () => {
  it('removes a planned entry without touching inventory', async () => {
    await seedInv('Chicken Breast', 3);
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast'])), wk());

    const res = await DELETE_ENTRY(bodyReq('DELETE'), wkSlot(SLOT_A));
    expect(res.status).toBe(200);
    expect(await invQty('Chicken Breast')).toBe(3);
  });

  it('deleting a cooked entry keeps the consumption (FR-MC-014)', async () => {
    const id = await seedInv('Chicken Breast', 3);
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast'])), wk());
    await PATCH_ENTRY(
      bodyReq('PATCH', cookBody([{ inventoryItemId: id, name: 'Chicken Breast', quantity: 1, unit: 'units' }])),
      wkSlot(SLOT_A),
    );
    expect(await invQty('Chicken Breast')).toBe(2);

    const res = await DELETE_ENTRY(bodyReq('DELETE'), wkSlot(SLOT_A));
    expect(res.status).toBe(200);
    expect(await invQty('Chicken Breast')).toBe(2); // food stays eaten
  });

  it('returns 404 for a non-existent slotId', async () => {
    const res = await DELETE_ENTRY(bodyReq('DELETE'), wkSlot(SLOT_B));
    expect(res.status).toBe(404);
  });
});

describe('PUT — replace is inventory-neutral and lifecycle-preserving (FR-MC-006)', () => {
  it('replacing the plan never changes inventory', async () => {
    await seedInv('Chicken Breast', 3);
    await seedInv('Rice', 3);
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast'])), wk());

    const res = await PUT(bodyReq('PUT', { entries: [entry(SLOT_B, ['Rice'])] }), wk());
    expect(res.status).toBe(200);
    expect(await invQty('Chicken Breast')).toBe(3);
    expect(await invQty('Rice')).toBe(3);
  });

  it('preserves stored cooked state + receipt for surviving slotIds and ignores forged lifecycle fields', async () => {
    const id = await seedInv('Chicken Breast', 3);
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast'])), wk());
    await PATCH_ENTRY(
      bodyReq('PATCH', cookBody([{ inventoryItemId: id, name: 'Chicken Breast', quantity: 1, unit: 'units' }])),
      wkSlot(SLOT_A),
    );

    // Drag-move: client re-sends both entries; forges planned status on the cooked one.
    const moved = { ...entry(SLOT_A, ['Chicken Breast']), status: 'planned', consumedItems: [] };
    const res = await PUT(bodyReq('PUT', { entries: [moved, entry(SLOT_B, [])] }), wk());
    expect(res.status).toBe(200);

    const stored = await storedEntries();
    const a = stored.find((e) => e.slotId === SLOT_A)!;
    const b = stored.find((e) => e.slotId === SLOT_B)!;
    expect(a.status).toBe('cooked');
    expect(a.cookedAt).toBeDefined();
    expect(a.consumedItems).toHaveLength(1);
    expect(b.status).toBe('planned');
    expect(await invQty('Chicken Breast')).toBe(2); // PUT itself deducted nothing
  });

  it('a PUT that drops a cooked entry leaves inventory unchanged (mirrors FR-MC-014)', async () => {
    const id = await seedInv('Chicken Breast', 3);
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast'])), wk());
    await PATCH_ENTRY(
      bodyReq('PATCH', cookBody([{ inventoryItemId: id, name: 'Chicken Breast', quantity: 1, unit: 'units' }])),
      wkSlot(SLOT_A),
    );
    expect(await invQty('Chicken Breast')).toBe(2);

    const res = await PUT(bodyReq('PUT', { entries: [entry(SLOT_B, [])] }), wk());
    expect(res.status).toBe(200);
    expect(await invQty('Chicken Breast')).toBe(2);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await PUT(bodyReq('PUT', { entries: [{ slotId: 'nope' }] }), wk());
    expect(res.status).toBe(400);
  });
});

describe('PATCH entries — cook (FR-MC-007..010, SC-MC-003)', () => {
  it('deducts the confirmed amounts (incl. zeroed + clamped lines), sets cookedAt, returns the receipt', async () => {
    const chickenId = await seedInv('Chicken Breast', 3);
    const riceId = await seedInv('Rice', 2);
    const sauceId = await seedInv('Soy Sauce', 1);
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast', 'Rice', 'Soy Sauce'])), wk());

    const res = await PATCH_ENTRY(
      bodyReq(
        'PATCH',
        cookBody([
          { inventoryItemId: chickenId, name: 'Chicken Breast', quantity: 2, unit: 'units' },
          { inventoryItemId: riceId, name: 'Rice', quantity: 0, unit: 'units' }, // didn't use it
          { inventoryItemId: sauceId, name: 'Soy Sauce', quantity: 99, unit: 'units' }, // over-ask → clamp
        ]),
      ),
      wkSlot(SLOT_A),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { receipt: Array<{ name: string; quantityConsumed: number }> };
    expect(await invQty('Chicken Breast')).toBe(1);
    expect(await invQty('Rice')).toBe(2);
    expect(await invQty('Soy Sauce')).toBeNull(); // depleted → removed
    expect(body.receipt.find((l) => l.name === 'Chicken Breast')!.quantityConsumed).toBe(2);
    expect(body.receipt.find((l) => l.name === 'Rice')!.quantityConsumed).toBe(0);
    expect(body.receipt.find((l) => l.name === 'Soy Sauce')!.quantityConsumed).toBe(1);

    const [stored] = await storedEntries();
    expect(stored!.status).toBe('cooked');
    expect(stored!.cookedAt).toBeDefined();
    expect(stored!.consumedItems).toHaveLength(3);
  });

  it('is idempotent — a second cook 409s and never double-deducts (SC-MC-003)', async () => {
    const id = await seedInv('Chicken Breast', 3);
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast'])), wk());
    const line = [{ inventoryItemId: id, name: 'Chicken Breast', quantity: 1, unit: 'units' }];

    const first = await PATCH_ENTRY(bodyReq('PATCH', cookBody(line)), wkSlot(SLOT_A));
    expect(first.status).toBe(200);
    const second = await PATCH_ENTRY(bodyReq('PATCH', cookBody(line)), wkSlot(SLOT_A));
    expect(second.status).toBe(409);
    expect(await invQty('Chicken Breast')).toBe(2);
  });

  it('returns 404 for an unknown slotId', async () => {
    const res = await PATCH_ENTRY(bodyReq('PATCH', cookBody([])), wkSlot(SLOT_B));
    expect(res.status).toBe(404);
  });

  it('a legacy entry (no status) reads as cooked — cook 409s (FR-MC-011)', async () => {
    await seedInv('Chicken Breast', 3);
    // Pre-006 entry inserted directly: no status/cookedAt/consumedItems fields.
    await MealPlan.create({
      userId: USER,
      weekStart: new Date(WEEK_START),
      entries: [{ slotId: SLOT_A, date: new Date(WEEK_START), mealType: 'dinner', meal: entry(SLOT_A, ['Chicken Breast'])['meal'] }],
    });

    const res = await PATCH_ENTRY(bodyReq('PATCH', cookBody([])), wkSlot(SLOT_A));
    expect(res.status).toBe(409);
    expect(await invQty('Chicken Breast')).toBe(3);
  });

  it('invalidates the recommendations cache on cook (FR-MC-010)', async () => {
    const id = await seedInv('Chicken Breast', 3);
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, ['Chicken Breast'])), wk());
    await PATCH_ENTRY(
      bodyReq('PATCH', cookBody([{ inventoryItemId: id, name: 'Chicken Breast', quantity: 1, unit: 'units' }])),
      wkSlot(SLOT_A),
    );
    expect(invalidateUserSpy).toHaveBeenCalledWith(USER);
  });

  it('returns 400 for an invalid PATCH body', async () => {
    await ADD_ENTRY(bodyReq('POST', entry(SLOT_A, [])), wk());
    const res = await PATCH_ENTRY(bodyReq('PATCH', { action: 'devour' }), wkSlot(SLOT_A));
    expect(res.status).toBe(400);
  });
});
