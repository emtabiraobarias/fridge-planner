// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { startOfTodayCutoff } from '@server/lib/rolling-grocery';

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
let GroceryList: typeof import('@server/models/grocery-list').GroceryList;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
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
  ({ GroceryList } = await import('@server/models/grocery-list'));
  ({ InventoryItem } = await import('@server/models/inventory-item'));
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
  invalidateUserSpy.mockClear();
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
  purchaseReceipt?: {
    inventoryItemId: string;
    quantityAdded: number;
    unit: string;
    merged: boolean;
  };
  addedOn?: string;
  purchasedOn?: string;
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

  // Spec 008 US3: GET now recomputes on every view within the rolling (today-onwards)
  // scope (FR-RG-001/002), not a generate-once lazy create. `validMealEntry`'s fixed
  // 2026-04-06 date is in the past by the time this suite runs, so these two cases
  // (previously seeded via `seedMealPlan()`'s past-dated default) are re-anchored to
  // an in-scope date via `utcMidnightOffset` — otherwise they'd assert on a list that
  // the rolling scope correctly empties (see the dedicated FR-RG-009 case below for
  // that scenario). Not a weakening: this is the contract-correct re-anchor noted in
  // quickstart.md T002.
  it('generates a list from the meal plan on GET when the entry is in scope', async () => {
    await seedMealPlan(USER_A, [{ ...validMealEntry, date: utcMidnightOffset(0).toISOString() }]);
    const res = await GET(req(), wk());
    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[]; generatedAt: string } };
    expect(groceryList.items.length).toBeGreaterThan(0);
    expect(groceryList.generatedAt).toBeTruthy();
  });

  it('aggregates the same ingredient across multiple in-scope meals', async () => {
    await seedMealPlan(USER_A, [
      { ...validMealEntry, date: utcMidnightOffset(0).toISOString() },
      { ...secondMealEntry, date: utcMidnightOffset(1).toISOString() },
    ]);
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

// ——— Spec 008 US1: rolling date scope on force-regenerate (FR-RG-001/006/007, T010) ———

/** A UTC-midnight instant offset by `days` from the server's local calendar day —
 *  mirrors startOfTodayCutoff() so entries land deterministically in/out of scope. */
function utcMidnightOffset(days: number): Date {
  const now = new Date();
  const base = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  base.setUTCDate(base.getUTCDate() + days);
  return base;
}

function datedEntry(opts: {
  date: Date;
  missing: string[];
  mealName: string;
  slotId: string;
}): Record<string, unknown> {
  return {
    slotId: opts.slotId,
    date: opts.date.toISOString(),
    mealType: 'dinner',
    status: 'planned',
    meal: {
      mealName: opts.mealName,
      suggestedMealType: 'dinner',
      prepTimeMinutes: 20,
      cuisine: 'Test',
      description: '',
      usesIngredients: [],
      expiringIngredients: [],
      missingIngredients: opts.missing,
    },
  };
}

describe('POST grocery-lists/[weekStart]/generate — rolling date scope (spec 008 US1)', () => {
  it('lists only today-onwards needs and re-sources them (FR-RG-001/007)', async () => {
    await MealPlan.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      entries: [
        datedEntry({
          date: utcMidnightOffset(-1),
          missing: ['soy sauce', 'sriracha'],
          mealName: 'Past Dinner',
          slotId: '11111111-1111-4111-8111-111111111111',
        }),
        datedEntry({
          date: utcMidnightOffset(1),
          missing: ['soy sauce'],
          mealName: 'Future Dinner',
          slotId: '22222222-2222-4222-8222-222222222222',
        }),
      ],
    });

    const res = await GENERATE(req({ method: 'POST' }), wk());
    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };

    const soy = groceryList.items.find((i) => i.ingredientName === 'soy sauce');
    expect(soy?.quantity).toBe(1); // only the tomorrow meal counts
    expect(soy?.sourceMealNames).toEqual(['Future Dinner']);
    // 'sriracha' sourced only by the past meal → never listed.
    expect(groceryList.items.find((i) => i.ingredientName === 'sriracha')).toBeUndefined();
  });

  it('drops a stored generated-only line whose fresh need is gone, and inserts new needs (FR-RG-006)', async () => {
    await MealPlan.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      entries: [
        datedEntry({
          date: utcMidnightOffset(1),
          missing: ['kombu'],
          mealName: 'Future Dinner',
          slotId: '33333333-3333-4333-8333-333333333333',
        }),
      ],
    });
    // A stale generated row for an ingredient no in-scope meal needs anymore.
    await GroceryList.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      items: [
        {
          ingredientName: 'nori',
          displayName: 'Nori',
          quantity: 3,
          unit: 'servings',
          category: 'Other',
          isPurchased: false,
          isManuallyAdded: false,
          sourceMealNames: ['Gone Meal'],
          notes: '',
        },
      ],
      generatedAt: new Date(),
    });

    const res = await GENERATE(req({ method: 'POST' }), wk());
    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    expect(groceryList.items.find((i) => i.ingredientName === 'nori')).toBeUndefined();
    expect(groceryList.items.find((i) => i.ingredientName === 'kombu')).toBeDefined();
  });

  it('keeps a surviving generated row _id stable across regenerate (FR-RG-007)', async () => {
    await MealPlan.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      entries: [
        datedEntry({
          date: utcMidnightOffset(1),
          missing: ['kombu'],
          mealName: 'Future Dinner',
          slotId: '44444444-4444-4444-8444-444444444444',
        }),
      ],
    });
    const seeded = await GroceryList.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      items: [
        {
          ingredientName: 'kombu',
          displayName: 'Kombu',
          quantity: 9,
          unit: 'servings',
          category: 'Other',
          isPurchased: false,
          isManuallyAdded: false,
          sourceMealNames: ['Stale'],
          notes: '',
        },
      ],
      generatedAt: new Date(),
    });
    const originalId = String(seeded.items[0]!._id);

    const res = await GENERATE(req({ method: 'POST' }), wk());
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    const kombu = groceryList.items.find((i) => i.ingredientName === 'kombu');
    expect(kombu?._id).toBe(originalId); // id preserved → in-flight ticks stay valid
    expect(kombu?.quantity).toBe(1); // requantified to the single in-scope meal
  });
});

// ——— Spec 008 US3: GET recompute-on-view (FR-RG-002/008/009, T022/T023) ———

describe('GET grocery-lists/[weekStart] — rolling recompute-on-view (spec 008 US3)', () => {
  it('recomputes a stale stored document to reflect today scope on GET, no explicit regenerate (FR-RG-002 scenario 1)', async () => {
    await MealPlan.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      entries: [
        datedEntry({
          date: utcMidnightOffset(1),
          missing: ['kombu'],
          mealName: 'Future Dinner',
          slotId: 'aaaaaaaa-1111-4111-8111-111111111111',
        }),
      ],
    });
    // A document as it stood "yesterday": a generated-only row for a since-passed
    // meal's ingredient, and no row yet for tomorrow's kombu.
    await GroceryList.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      items: [
        {
          ingredientName: 'nori',
          displayName: 'Nori',
          quantity: 3,
          unit: 'servings',
          category: 'Other',
          isPurchased: false,
          isManuallyAdded: false,
          sourceMealNames: ['Gone Meal'],
          notes: '',
        },
      ],
      generatedAt: new Date(),
    });

    const res = await GET(req(), wk());
    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    expect(groceryList.items.find((i) => i.ingredientName === 'nori')).toBeUndefined();
    expect(groceryList.items.find((i) => i.ingredientName === 'kombu')).toBeDefined();
  });

  it('GET and a subsequent force-generate at the same instant return identical items (FR-RG-002 scenario 2)', async () => {
    await MealPlan.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      entries: [
        datedEntry({
          date: utcMidnightOffset(1),
          missing: ['kombu'],
          mealName: 'Future Dinner',
          slotId: 'bbbbbbbb-2222-4222-8222-222222222222',
        }),
      ],
    });

    const getRes = await GET(req(), wk());
    expect(getRes.status).toBe(200);
    const { groceryList: getList } = (await getRes.json()) as { groceryList: { items: GLItem[] } };

    const genRes = await GENERATE(req({ method: 'POST' }), wk());
    expect(genRes.status).toBe(200);
    const { groceryList: genList } = (await genRes.json()) as { groceryList: { items: GLItem[] } };

    expect(genList.items).toEqual(getList.items);
  });

  it('a future week GET counts all its planned meals (FR-RG-002 scenario 3)', async () => {
    const futureWeek = utcMidnightOffset(30).toISOString();
    await MealPlan.create({
      userId: USER_A,
      weekStart: new Date(futureWeek),
      entries: [
        datedEntry({
          date: utcMidnightOffset(31),
          missing: ['kombu'],
          mealName: 'Future Meal One',
          slotId: 'cccccccc-3333-4333-8333-333333333333',
        }),
        datedEntry({
          date: utcMidnightOffset(32),
          missing: ['kombu'],
          mealName: 'Future Meal Two',
          slotId: 'dddddddd-4444-4444-8444-444444444444',
        }),
      ],
    });

    const res = await GET(req(), wk(futureWeek));
    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    const kombu = groceryList.items.find((i) => i.ingredientName === 'kombu');
    expect(kombu?.quantity).toBe(2);
    expect(kombu?.sourceMealNames).toEqual(['Future Meal One', 'Future Meal Two']);
  });

  it('a fully-past week recomputes to empty generated needs — no browsable history (FR-RG-009)', async () => {
    await MealPlan.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      entries: [
        datedEntry({
          date: utcMidnightOffset(-2),
          missing: ['soy sauce'],
          mealName: 'Long Gone Dinner',
          slotId: 'eeeeeeee-5555-4555-8555-555555555555',
        }),
        datedEntry({
          date: utcMidnightOffset(-1),
          missing: ['sriracha'],
          mealName: 'Yesterday Dinner',
          slotId: 'ffffffff-6666-4666-8666-666666666666',
        }),
      ],
    });

    const res = await GET(req(), wk());
    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } | null };
    expect(groceryList).not.toBeNull();
    expect(groceryList?.items).toEqual([]);
  });

  it('still returns { groceryList: null } when no meal plan and no stored list exist for the week (unchanged null path)', async () => {
    const res = await GET(req(), wk());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { groceryList: unknown }).groceryList).toBeNull();
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

// ——— Spec 008 US2: day-anchor stamp on manual add (FR-RG-004, T016) ———

describe('POST grocery-lists/[weekStart]/items — day-anchor stamp (spec 008 US2)', () => {
  it('stamps addedOn on a newly added manual item, on the projected day-cutoff axis (FR-RG-004)', async () => {
    const items = await addItem({ displayName: 'Vinegar', quantity: 1, unit: 'bottle', category: 'Pantry' });
    const vinegar = items.find((i) => i.displayName === 'Vinegar');
    expect(vinegar?.addedOn).toBe(startOfTodayCutoff().toISOString());
  });

  it('leaves a same-day manual item unchanged (present, still manual) across regenerate (FR-RG-004)', async () => {
    await MealPlan.create({ userId: USER_A, weekStart: new Date(WEEK_START), entries: [] });
    const items = await addItem({ displayName: 'Vinegar', quantity: 1, unit: 'bottle', category: 'Pantry' });
    const vinegarId = items.find((i) => i.displayName === 'Vinegar')!._id;

    const res = await GENERATE(req({ method: 'POST' }), wk());
    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    const vinegar = groceryList.items.find((i) => i._id === vinegarId);
    expect(vinegar).toBeDefined();
    expect(vinegar?.isManuallyAdded).toBe(true);
    expect(vinegar?.addedOn).toBeTruthy();
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

  it('adds inventory immediately and stores a purchase receipt when ticking bought (FR-GC-001/003)', async () => {
    const items = await addItem({ displayName: 'Olive Oil', quantity: 1, unit: 'bottle', category: 'Pantry' });
    const id = items.find((i) => i.displayName === 'Olive Oil')!._id;

    const res = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(id));

    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    const row = groceryList.items.find((i) => i._id === id);
    const inventory = await InventoryItem.findOne({ userId: USER_A, name: 'Olive Oil' });
    expect(inventory?.quantity).toBe(1);
    expect(inventory?.unit).toBe('bottle');
    expect(inventory?.location).toBe('pantry');
    expect(row?.isPurchased).toBe(true);
    expect(row?.purchaseReceipt).toMatchObject({
      inventoryItemId: String(inventory!._id),
      quantityAdded: 1,
      unit: 'bottle',
      merged: false,
    });
    expect(invalidateUserSpy).toHaveBeenCalledWith(USER_A);
  });

  it('merges into existing same-name stock and records a merged receipt (FR-GC-004/005)', async () => {
    const existing = await InventoryItem.create({
      userId: USER_A,
      name: 'Milk',
      quantity: 1,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
    });
    const items = await addItem({ displayName: 'Milk', quantity: 3, unit: 'servings', category: 'Dairy' });
    const id = items.find((i) => i.displayName === 'Milk')!._id;

    const res = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(id));

    expect(res.status).toBe(200);
    const inventory = await InventoryItem.findById(existing._id);
    expect(inventory?.quantity).toBe(4);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    expect(groceryList.items.find((i) => i._id === id)?.purchaseReceipt).toMatchObject({
      inventoryItemId: String(existing._id),
      quantityAdded: 3,
      unit: 'L',
      merged: true,
    });
  });

  it('treats manual lines the same as generated lines (FR-GC-001)', async () => {
    const items = await addItem({ displayName: 'Butter', quantity: 2, unit: 'count', category: 'Dairy' });
    const id = items.find((i) => i.displayName === 'Butter')!._id;

    const res = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(id));

    expect(res.status).toBe(200);
    expect(await InventoryItem.findOne({ userId: USER_A, name: 'Butter' })).toBeTruthy();
  });

  it('deduplicates duplicate ticks with one inventory add and a 409 loser (FR-GC-002)', async () => {
    const list = await GroceryList.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      items: [
        {
          ingredientName: 'milk',
          displayName: 'Milk',
          quantity: 2,
          unit: 'L',
          category: 'Dairy',
          isPurchased: false,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
        },
      ],
      generatedAt: new Date(),
    });
    const id = String(list.items[0]!._id);

    const [first, second] = await Promise.all([
      PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(id)),
      PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(id)),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await InventoryItem.countDocuments({ userId: USER_A, name: 'Milk' })).toBe(1);
    const inventory = await InventoryItem.findOne({ userId: USER_A, name: 'Milk' });
    expect(inventory?.quantity).toBe(2);
  });

  it('un-ticks by reversing the stored purchase receipt and clearing state (FR-GC-007/008)', async () => {
    const items = await addItem({ displayName: 'Olive Oil', quantity: 1, unit: 'bottle', category: 'Pantry' });
    const id = items.find((i) => i.displayName === 'Olive Oil')!._id;
    await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(id));

    const res = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: false } }), wkItem(id));

    expect(res.status).toBe(200);
    expect(await InventoryItem.findOne({ userId: USER_A, name: 'Olive Oil' })).toBeNull();
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    const row = groceryList.items.find((i) => i._id === id);
    expect(row?.isPurchased).toBe(false);
    expect(row?.purchaseReceipt).toBeUndefined();
    expect(invalidateUserSpy).toHaveBeenCalledWith(USER_A);
  });

  it('deduplicates duplicate un-ticks with one reversal and a 409 loser (FR-GC-007)', async () => {
    const items = await addItem({ displayName: 'Milk', quantity: 2, unit: 'L', category: 'Dairy' });
    const id = items.find((i) => i.displayName === 'Milk')!._id;
    await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(id));

    const [first, second] = await Promise.all([
      PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: false } }), wkItem(id)),
      PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: false } }), wkItem(id)),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await InventoryItem.findOne({ userId: USER_A, name: 'Milk' })).toBeNull();
  });

  it('returns 409 instead of guessing when a legacy purchased line has no receipt (FR-GC-007)', async () => {
    const list = await GroceryList.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      items: [
        {
          ingredientName: 'milk',
          displayName: 'Milk',
          quantity: 2,
          unit: 'L',
          category: 'Dairy',
          isPurchased: true,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
        },
      ],
      generatedAt: new Date(),
    });
    const id = String(list.items[0]!._id);

    const res = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: false } }), wkItem(id));

    expect(res.status).toBe(409);
    expect(await InventoryItem.findOne({ userId: USER_A, name: 'Milk' })).toBeNull();
  });
});

// ——— Spec 008 US2: day-anchor stamps + daily shed on PATCH (FR-RG-004/005/011, T015) ———

describe('PATCH grocery-lists/[weekStart]/items/[itemId] — day-anchor stamps + shed (spec 008 US2)', () => {
  it('stamps purchasedOn on tick, on the projected day-cutoff axis (FR-RG-005)', async () => {
    const items = await addItem({ displayName: 'Eggs', quantity: 12, unit: 'count', category: 'Dairy' });
    const id = items.find((i) => i.displayName === 'Eggs')!._id;

    const res = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(id));

    expect(res.status).toBe(200);
    const { groceryList } = (await res.json()) as { groceryList: { items: GLItem[] } };
    const row = groceryList.items.find((i) => i._id === id);
    expect(row?.purchasedOn).toBe(startOfTodayCutoff().toISOString());
  });

  it('regenerating the same day after a tick leaves the row purchased with its receipt (FR-RG-005)', async () => {
    await MealPlan.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      entries: [
        datedEntry({
          date: utcMidnightOffset(0),
          missing: ['flour'],
          mealName: 'Today Bake',
          slotId: '55555555-5555-4555-8555-555555555555',
        }),
      ],
    });
    const genRes = await GENERATE(req({ method: 'POST' }), wk());
    const { groceryList: genList } = (await genRes.json()) as { groceryList: { items: GLItem[] } };
    const flourId = genList.items.find((i) => i.ingredientName === 'flour')!._id;

    const tickRes = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(flourId));
    expect(tickRes.status).toBe(200);

    const regenRes = await GENERATE(req({ method: 'POST' }), wk());
    expect(regenRes.status).toBe(200);
    const { groceryList: regenList } = (await regenRes.json()) as { groceryList: { items: GLItem[] } };
    const flour = regenList.items.find((i) => i._id === flourId);
    expect(flour).toBeDefined();
    expect(flour?.isPurchased).toBe(true);
    expect(flour?.purchaseReceipt).toBeDefined();
  });

  it('a recompute fired between a tick and its un-tick does not detach the receipt (mid-shop race, FR-RG-011)', async () => {
    await MealPlan.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      entries: [
        datedEntry({
          date: utcMidnightOffset(0),
          missing: ['sugar'],
          mealName: 'Today Bake',
          slotId: '66666666-6666-4666-8666-666666666666',
        }),
      ],
    });
    const genRes = await GENERATE(req({ method: 'POST' }), wk());
    const { groceryList: genList } = (await genRes.json()) as { groceryList: { items: GLItem[] } };
    const sugarId = genList.items.find((i) => i.ingredientName === 'sugar')!._id;

    const tickRes = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(sugarId));
    expect(tickRes.status).toBe(200);

    // Mid-shop recompute race: a regenerate fires between the tick and the un-tick.
    const midRegen = await GENERATE(req({ method: 'POST' }), wk());
    expect(midRegen.status).toBe(200);

    const untickRes = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: false } }), wkItem(sugarId));
    expect(untickRes.status).toBe(200);
    expect(await InventoryItem.findOne({ userId: USER_A, name: 'Sugar' })).toBeNull();
  });

  it('returns 404 (not 409) for un-tick after the row has shed (research D7)', async () => {
    await MealPlan.create({ userId: USER_A, weekStart: new Date(WEEK_START), entries: [] });
    const list = await GroceryList.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      items: [
        {
          ingredientName: 'stale milk',
          displayName: 'Stale Milk',
          quantity: 1,
          unit: 'L',
          category: 'Dairy',
          isPurchased: true,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
          purchasedOn: utcMidnightOffset(-1),
          purchaseReceipt: {
            inventoryItemId: new mongoose.Types.ObjectId().toHexString(),
            quantityAdded: 1,
            unit: 'L',
            merged: false,
          },
        },
      ],
      generatedAt: new Date(),
    });
    const id = String(list.items[0]!._id);

    const regen = await GENERATE(req({ method: 'POST' }), wk());
    expect(regen.status).toBe(200);
    const { groceryList: regenList } = (await regen.json()) as { groceryList: { items: GLItem[] } };
    expect(regenList.items.find((i) => i._id === id)).toBeUndefined(); // shed

    const untick = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: false } }), wkItem(id));
    expect(untick.status).toBe(404);
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
  it('skips receipted lines and purchases the remaining server-side list items (FR-GC-011)', async () => {
    const oil = await InventoryItem.create({
      userId: USER_A,
      name: 'Olive Oil',
      quantity: 1,
      unit: 'bottle',
      category: 'Pantry',
      location: 'pantry',
    });
    const milk = await InventoryItem.create({
      userId: USER_A,
      name: 'Milk',
      quantity: 1,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
    });
    const list = await GroceryList.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      items: [
        {
          ingredientName: 'olive oil',
          displayName: 'Olive Oil',
          quantity: 1,
          unit: 'bottle',
          category: 'Pantry',
          isPurchased: true,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
          purchaseReceipt: {
            inventoryItemId: String(oil._id),
            quantityAdded: 1,
            unit: 'bottle',
            merged: false,
          },
        },
        {
          ingredientName: 'milk',
          displayName: 'Milk',
          quantity: 2,
          unit: 'servings',
          category: 'Dairy',
          isPurchased: false,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
        },
        {
          ingredientName: 'tortillas',
          displayName: 'Tortillas',
          quantity: 2,
          unit: 'servings',
          category: 'Grains',
          isPurchased: false,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
        },
      ],
      generatedAt: new Date(),
    });

    const res = await COMPLETE(
      req({
        method: 'POST',
        body: {
          items: [
            {
              itemId: String(list.items[0]!._id),
              name: 'Ignored Client Oil',
              quantity: 99,
              unit: 'bottle',
              category: 'Pantry',
              location: 'pantry',
            },
          ],
        },
      }),
      wk(),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      created: Array<{ name: string }>;
      updated: Array<{ name: string }>;
      skipped: number;
      errors: string[];
    };
    expect(json.skipped).toBe(1);
    expect(json.created).toHaveLength(1);
    expect(json.created[0]?.name).toBe('Tortillas');
    expect(json.updated).toHaveLength(1);
    expect(json.updated[0]?.name).toBe('Milk');
    expect(json.errors).toHaveLength(0);

    expect((await InventoryItem.findById(oil._id))?.quantity).toBe(1);
    expect((await InventoryItem.findById(milk._id))?.quantity).toBe(3);
    const tortillas = await InventoryItem.findOne({ userId: USER_A, name: 'Tortillas' });
    expect(tortillas).toMatchObject({ quantity: 2, unit: 'count', location: 'pantry' });

    const updatedList = await GroceryList.findById(list._id);
    expect(updatedList?.items.every((item) => item.isPurchased)).toBe(true);
    expect(updatedList?.items.every((item) => item.purchaseReceipt)).toBe(true);
    expect(invalidateUserSpy).toHaveBeenCalledWith(USER_A);
  });

  it('returns 404 when completing a missing week list (FR-GC-011)', async () => {
    const res = await COMPLETE(req({ method: 'POST', body: { items: [] } }), wk());
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await COMPLETE(req({ method: 'POST', body: { items: [{ name: 'Something' }] } }), wk());
    expect(res.status).toBe(400);
  });

  // ——— Spec 008 US2: checkout stamps purchasedOn like any tick (contract "008 note", T015) ———
  it('stamps purchasedOn on every row it marks purchased at checkout, on the projected day-cutoff axis', async () => {
    const list = await GroceryList.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      items: [
        {
          ingredientName: 'flour',
          displayName: 'Flour',
          quantity: 2,
          unit: 'servings',
          category: 'Grains',
          isPurchased: false,
          isManuallyAdded: false,
          sourceMealNames: [],
          notes: '',
        },
      ],
      generatedAt: new Date(),
    });

    const res = await COMPLETE(req({ method: 'POST', body: { items: [] } }), wk());
    expect(res.status).toBe(200);

    const updated = await GroceryList.findById(list._id);
    const flour = updated?.items.find((i) => i.ingredientName === 'flour');
    expect(flour?.isPurchased).toBe(true);
    expect(flour?.purchasedOn?.toISOString()).toBe(startOfTodayCutoff().toISOString());
  });
});

// ——— Spec 008 US2 (T017): rolling recompute + tick concurrency, id-stability guard ———
//
// The literal task text says "GET the list (recompute)...", but at this phase (US2)
// GET still runs the unchanged 007 lazy-generate path (US3/T025 is the one that wires
// GET onto the shared reconcile path — see CLAUDE.md/orchestrator note: do not touch
// getGroceryList here). `POST .../generate` already runs the exact same
// `reconcileRollingList` mechanism GET will reuse in US3 (research D2), so this test
// exercises the id-stability guarantee (research risk 2 / FR-RG-011) against that
// shared path today. T029 (Phase 6) adds the literal GET-based variant once US3 lands.
describe('Rolling recompute + tick concurrency (spec 008 US2, T017)', () => {
  it('a row from a just-recomputed list can be ticked immediately, and the tick stamps purchasedOn', async () => {
    await MealPlan.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      entries: [
        datedEntry({
          date: utcMidnightOffset(0),
          missing: ['basil'],
          mealName: 'Today Pasta',
          slotId: '77777777-7777-4777-8777-777777777777',
        }),
      ],
    });
    const genRes = await GENERATE(req({ method: 'POST' }), wk());
    expect(genRes.status).toBe(200);
    const { groceryList } = (await genRes.json()) as { groceryList: { items: GLItem[] } };
    const basilId = groceryList.items.find((i) => i.ingredientName === 'basil')!._id;

    const tickRes = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(basilId));
    expect(tickRes.status).toBe(200); // not 404 — the recomputed row's _id stayed live
    const { groceryList: ticked } = (await tickRes.json()) as { groceryList: { items: GLItem[] } };
    expect(ticked.items.find((i) => i._id === basilId)?.purchasedOn).toBeTruthy();
  });
});

// ——— Spec 008 Phase 6 (T029): literal GET-recompute-then-tick variant ———
//
// T017 (US2) exercised the id-stability guarantee via POST .../generate, since at that
// phase GET still ran the unchanged 007 lazy-generate path. US3/T025 has since wired GET
// onto the same reconcileRollingList path as generate (research D2, "one date-scoped
// generation path shared by lazy GET and force-generate"), so this adds the literal
// "GET the list (triggers a persisted recompute), then PATCH-tick a row by the _id GET
// returned" variant research risk 2 / FR-RG-011 calls for.
describe('GET-recompute + tick concurrency (spec 008 Phase 6, T029)', () => {
  it('a row from a just-GET-recomputed list can be ticked immediately by its returned _id (200, not 404)', async () => {
    await MealPlan.create({
      userId: USER_A,
      weekStart: new Date(WEEK_START),
      entries: [
        datedEntry({
          date: utcMidnightOffset(0),
          missing: ['cilantro'],
          mealName: 'Today Tacos',
          slotId: '99999999-9999-4999-8999-999999999999',
        }),
      ],
    });

    const getRes = await GET(req(), wk());
    expect(getRes.status).toBe(200);
    const { groceryList } = (await getRes.json()) as { groceryList: { items: GLItem[] } };
    const cilantroId = groceryList.items.find((i) => i.ingredientName === 'cilantro')!._id;

    const tickRes = await PATCH_ITEM(req({ method: 'PATCH', body: { isPurchased: true } }), wkItem(cilantroId));
    expect(tickRes.status).toBe(200); // not 404 — GET's persisted recompute kept a live _id
    const { groceryList: ticked } = (await tickRes.json()) as { groceryList: { items: GLItem[] } };
    expect(ticked.items.find((i) => i._id === cilantroId)?.purchasedOn).toBeTruthy();
  });
});
