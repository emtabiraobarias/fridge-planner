// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const WEEK_START = '2026-04-06T00:00:00.000Z';
const USER_A = 'user-a';
const USER_B = 'user-b';

const validMealEntry = {
  slotId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  date: '2026-04-06T00:00:00.000Z',
  mealType: 'dinner',
  status: 'planned', // spec 006: only planned entries generate grocery needs (FR-MC-016)
  meal: {
    mealName: 'Chicken Fried Rice',
    suggestedMealType: 'dinner',
    prepTimeMinutes: 25,
    cuisine: 'Asian',
    description: 'Quick rice dish.',
    usesIngredients: ['chicken breast', 'rice'],
    expiringIngredients: ['chicken breast'],
    missingIngredients: ['soy sauce', 'sesame oil'],
  },
};

const secondMealEntry = {
  slotId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  date: '2026-04-07T00:00:00.000Z',
  mealType: 'lunch',
  status: 'planned', // spec 006 (FR-MC-016)
  meal: {
    mealName: 'Caesar Salad',
    suggestedMealType: 'lunch',
    prepTimeMinutes: 10,
    cuisine: 'Italian',
    description: 'Classic caesar.',
    usesIngredients: ['lettuce'],
    expiringIngredients: [],
    missingIngredients: ['soy sauce', 'croutons'],
  },
};

let mongod: MongoMemoryServer;
let MealPlan: typeof import('@server/models/meal-plan').MealPlan;
let GET: typeof import('../../app/api/v1/grocery-lists/[weekStart]/route').GET;
let GENERATE: typeof import('../../app/api/v1/grocery-lists/[weekStart]/generate/route').POST;
let ADD_ITEM: typeof import('../../app/api/v1/grocery-lists/[weekStart]/items/route').POST;
let PATCH_ITEM: typeof import('../../app/api/v1/grocery-lists/[weekStart]/items/[itemId]/route').PATCH;
let DELETE_ITEM: typeof import('../../app/api/v1/grocery-lists/[weekStart]/items/[itemId]/route').DELETE;
let COMPLETE: typeof import('../../app/api/v1/grocery-lists/[weekStart]/complete/route').POST;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ MealPlan } = await import('@server/models/meal-plan'));
  ({ GET } = await import('../../app/api/v1/grocery-lists/[weekStart]/route'));
  ({ POST: GENERATE } = await import('../../app/api/v1/grocery-lists/[weekStart]/generate/route'));
  ({ POST: ADD_ITEM } = await import('../../app/api/v1/grocery-lists/[weekStart]/items/route'));
  ({ PATCH: PATCH_ITEM, DELETE: DELETE_ITEM } = await import(
    '../../app/api/v1/grocery-lists/[weekStart]/items/[itemId]/route'
  ));
  ({ POST: COMPLETE } = await import('../../app/api/v1/grocery-lists/[weekStart]/complete/route'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

function req(opts: { userId?: string; method?: string; body?: unknown } = {}): Request {
  const { userId = USER_A, method = 'GET', body } = opts;
  return new Request('http://localhost/api/v1/grocery-lists', {
    method,
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function wk(weekStart = WEEK_START): { params: Promise<{ weekStart: string }> } {
  return { params: Promise.resolve({ weekStart }) };
}

function wkItem(itemId: string, weekStart = WEEK_START): { params: Promise<{ weekStart: string; itemId: string }> } {
  return { params: Promise.resolve({ weekStart, itemId }) };
}

async function seedMealPlan(userId = USER_A, entries: unknown[] = [validMealEntry]): Promise<void> {
  await MealPlan.create({ userId, weekStart: new Date(WEEK_START), entries });
}

interface GLItem {
  _id: string;
  ingredientName: string;
  displayName: string;
  quantity: number;
  unit: string;
  category: string;
  isPurchased: boolean;
  isManuallyAdded: boolean;
  notes: string;
}

async function addItem(item: Record<string, unknown>, userId = USER_A): Promise<GLItem[]> {
  const res = await ADD_ITEM(req({ userId, method: 'POST', body: item }), wk());
  const json = (await res.json()) as { groceryList: { items: GLItem[] } };
  return json.groceryList.items;
}

describe('GET grocery-lists/[weekStart]', () => {
  it('returns { groceryList: null } when no meal plan exists', async () => {
    const res = await GET(req(), wk());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { groceryList: unknown }).groceryList).toBeNull();
  });

  it('lazily generates a list from the meal plan on first GET', async () => {
    await seedMealPlan();
    const res = await GET(req(), wk());
    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[]; generatedAt: string } };
    expect(groceryList.items.length).toBeGreaterThan(0);
    expect(groceryList.generatedAt).toBeTruthy();
  });

  it('aggregates the same ingredient across multiple meals', async () => {
    await seedMealPlan(USER_A, [validMealEntry, secondMealEntry]);
    const res = await GET(req(), wk());
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    const soy = groceryList.items.find((i) => i.ingredientName === 'soy sauce');
    expect(soy?.quantity).toBe(2);
  });

  it('returns 400 for an invalid weekStart', async () => {
    const res = await GET(req(), wk('not-a-date'));
    expect(res.status).toBe(400);
  });

  it('isolates lists by user', async () => {
    await seedMealPlan(USER_A);
    const res = await GET(req({ userId: USER_B }), wk());
    expect(((await res.json()) as { groceryList: unknown }).groceryList).toBeNull();
  });
});

describe('POST grocery-lists/[weekStart]/generate', () => {
  it('returns 404 when no meal plan exists', async () => {
    const res = await GENERATE(req({ method: 'POST' }), wk());
    expect(res.status).toBe(404);
  });

  it('regenerates and preserves manually-added items', async () => {
    await seedMealPlan();
    await addItem({ displayName: 'Bread', quantity: 1, unit: 'loaf', category: 'Grains' });
    const res = await GENERATE(req({ method: 'POST' }), wk());
    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    const bread = groceryList.items.find((i) => i.displayName === 'Bread');
    expect(bread?.isManuallyAdded).toBe(true);
  });
});

describe('POST grocery-lists/[weekStart]/items', () => {
  it('adds a manual item and returns 201', async () => {
    const res = await ADD_ITEM(
      req({ method: 'POST', body: { displayName: 'Butter', quantity: 2, unit: 'tbsp', category: 'Dairy' } }),
      wk(),
    );
    expect(res.status).toBe(201);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    expect(groceryList.items.find((i) => i.displayName === 'Butter')?.isManuallyAdded).toBe(true);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await ADD_ITEM(req({ method: 'POST', body: { displayName: 'Butter' } }), wk());
    expect(res.status).toBe(400);
  });
});

describe('PATCH grocery-lists/[weekStart]/items/[itemId]', () => {
  it('toggles isPurchased and updates fields together', async () => {
    const items = await addItem({ displayName: 'Milk', quantity: 1, unit: 'l', category: 'Dairy' });
    const id = items.find((i) => i.displayName === 'Milk')!._id;
    const res = await PATCH_ITEM(
      req({ method: 'PATCH', body: { isPurchased: true, quantity: 3, notes: 'whole milk' } }),
      wkItem(id),
    );
    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    const milk = groceryList.items.find((i) => i.displayName === 'Milk');
    expect(milk?.isPurchased).toBe(true);
    expect(milk?.quantity).toBe(3);
    expect(milk?.notes).toBe('whole milk');
  });

  it('returns 400 for an invalid ObjectId', async () => {
    const res = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem('not-an-id'));
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent item', async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(fakeId));
    expect(res.status).toBe(404);
  });
});

describe('DELETE grocery-lists/[weekStart]/items/[itemId]', () => {
  it('removes an item', async () => {
    const items = await addItem({ displayName: 'Garlic', quantity: 3, unit: 'count', category: 'Produce' });
    const id = items.find((i) => i.displayName === 'Garlic')!._id;
    const res = await DELETE_ITEM(req({ method: 'DELETE' }), wkItem(id));
    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    expect(groceryList.items.find((i) => i.displayName === 'Garlic')).toBeUndefined();
  });

  it('returns 404 for a non-existent item', async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await DELETE_ITEM(req({ method: 'DELETE' }), wkItem(fakeId));
    expect(res.status).toBe(404);
  });
});

describe('POST grocery-lists/[weekStart]/complete', () => {
  it('creates inventory items for purchased goods (FR-032)', async () => {
    const fakeItemId = new mongoose.Types.ObjectId().toHexString();
    const res = await COMPLETE(
      req({
        method: 'POST',
        body: {
          items: [
            { itemId: fakeItemId, name: 'Olive Oil', quantity: 1, unit: 'bottle', category: 'Pantry', location: 'pantry' },
          ],
        },
      }),
      wk(),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { created: Array<{ name: string }>; errors: string[] };
    expect(json.created).toHaveLength(1);
    expect(json.created[0]?.name).toBe('Olive Oil');
    expect(json.errors).toHaveLength(0);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await COMPLETE(req({ method: 'POST', body: { items: [{ name: 'Something' }] } }), wk());
    expect(res.status).toBe(400);
  });
});
