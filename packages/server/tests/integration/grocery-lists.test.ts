import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Application } from 'express';

const { createApp } = await import('../../src/app.js');

let mongod: MongoMemoryServer;
let app: Application;

const WEEK_START = '2026-04-06T00:00:00.000Z';
const USER_A = 'user-a';
const USER_B = 'user-b';

const validMealEntry = {
  slotId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  date: '2026-04-06T00:00:00.000Z',
  mealType: 'dinner',
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

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

// Helper: seed a meal plan for user
async function seedMealPlan(user = USER_A, entries = [validMealEntry]): Promise<void> {
  for (const entry of entries) {
    await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .set('X-User-Id', user)
      .send(entry);
  }
}

describe('GET /api/v1/grocery-lists/:weekStart', () => {
  it('returns { groceryList: null } when no meal plan exists', async () => {
    const res = await request(app)
      .get(`/api/v1/grocery-lists/${WEEK_START}`)
      .set('X-User-Id', USER_A);
    expect(res.status).toBe(200);
    expect(res.body.groceryList).toBeNull();
  });

  it('lazily generates list from meal plan on first GET', async () => {
    await seedMealPlan();
    const res = await request(app)
      .get(`/api/v1/grocery-lists/${WEEK_START}`)
      .set('X-User-Id', USER_A);
    expect(res.status).toBe(200);
    expect(res.body.groceryList).not.toBeNull();
    expect(res.body.groceryList.items.length).toBeGreaterThan(0);
    expect(res.body.groceryList.generatedAt).toBeDefined();
  });

  it('returns persisted list on second GET (no re-generation)', async () => {
    await seedMealPlan();
    await request(app)
      .get(`/api/v1/grocery-lists/${WEEK_START}`)
      .set('X-User-Id', USER_A);

    const res = await request(app)
      .get(`/api/v1/grocery-lists/${WEEK_START}`)
      .set('X-User-Id', USER_A);
    expect(res.status).toBe(200);
    expect(res.body.groceryList).not.toBeNull();
  });

  it('aggregates same ingredient across multiple meals', async () => {
    await seedMealPlan(USER_A, [validMealEntry, secondMealEntry]);
    const res = await request(app)
      .get(`/api/v1/grocery-lists/${WEEK_START}`)
      .set('X-User-Id', USER_A);
    const items: Array<{ ingredientName: string; quantity: number }> = res.body.groceryList.items;
    const soySauceItem = items.find((i) => i.ingredientName === 'soy sauce');
    expect(soySauceItem).toBeDefined();
    expect(soySauceItem!.quantity).toBe(2);
  });

  it('returns 400 for an invalid weekStart', async () => {
    const res = await request(app)
      .get('/api/v1/grocery-lists/not-a-date')
      .set('X-User-Id', USER_A);
    expect(res.status).toBe(400);
  });

  it('isolates lists by user (auth)', async () => {
    await seedMealPlan(USER_A);
    const res = await request(app)
      .get(`/api/v1/grocery-lists/${WEEK_START}`)
      .set('X-User-Id', USER_B);
    // User B has no meal plan → null
    expect(res.body.groceryList).toBeNull();
  });
});

describe('POST /api/v1/grocery-lists/:weekStart/generate', () => {
  it('returns 404 when no meal plan exists', async () => {
    const res = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/generate`)
      .set('X-User-Id', USER_A);
    expect(res.status).toBe(404);
  });

  it('generates list and returns it', async () => {
    await seedMealPlan();
    const res = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/generate`)
      .set('X-User-Id', USER_A);
    expect(res.status).toBe(200);
    expect(res.body.groceryList.items.length).toBeGreaterThan(0);
  });

  it('preserves manually added items on regenerate', async () => {
    await seedMealPlan();
    // Add a manual item
    await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/items`)
      .set('X-User-Id', USER_A)
      .send({ displayName: 'Bread', quantity: 1, unit: 'loaf', category: 'Grains' });

    // Regenerate
    const res = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/generate`)
      .set('X-User-Id', USER_A);

    const items: Array<{ displayName: string; isManuallyAdded: boolean }> = res.body.groceryList.items;
    const manual = items.find((i) => i.displayName === 'Bread');
    expect(manual).toBeDefined();
    expect(manual!.isManuallyAdded).toBe(true);
  });
});

describe('POST /api/v1/grocery-lists/:weekStart/items', () => {
  it('adds a manual item and returns 201', async () => {
    const res = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/items`)
      .set('X-User-Id', USER_A)
      .send({ displayName: 'Butter', quantity: 2, unit: 'tbsp', category: 'Dairy' });
    expect(res.status).toBe(201);
    const items: Array<{ displayName: string; isManuallyAdded: boolean }> = res.body.groceryList.items;
    const butter = items.find((i) => i.displayName === 'Butter');
    expect(butter).toBeDefined();
    expect(butter!.isManuallyAdded).toBe(true);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/items`)
      .set('X-User-Id', USER_A)
      .send({ displayName: 'Butter' }); // missing quantity, unit, category
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/grocery-lists/:weekStart/items/:itemId', () => {
  it('toggles isPurchased to true', async () => {
    // Add a manual item first
    const addRes = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/items`)
      .set('X-User-Id', USER_A)
      .send({ displayName: 'Milk', quantity: 1, unit: 'l', category: 'Dairy' });

    const itemId: string = addRes.body.groceryList.items.find(
      (i: { displayName: string }) => i.displayName === 'Milk',
    )._id;

    const res = await request(app)
      .patch(`/api/v1/grocery-lists/${WEEK_START}/items/${itemId}`)
      .set('X-User-Id', USER_A)
      .send({ isPurchased: true });

    expect(res.status).toBe(200);
    const updated: Array<{ displayName: string; isPurchased: boolean }> = res.body.groceryList.items;
    const milk = updated.find((i) => i.displayName === 'Milk');
    expect(milk!.isPurchased).toBe(true);
  });

  it('updates displayName', async () => {
    const addRes = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/items`)
      .set('X-User-Id', USER_A)
      .send({ displayName: 'Eggs', quantity: 6, unit: 'count', category: 'Dairy' });

    const itemId: string = addRes.body.groceryList.items.find(
      (i: { displayName: string }) => i.displayName === 'Eggs',
    )._id;

    const res = await request(app)
      .patch(`/api/v1/grocery-lists/${WEEK_START}/items/${itemId}`)
      .set('X-User-Id', USER_A)
      .send({ displayName: 'Free Range Eggs' });

    expect(res.status).toBe(200);
    const updated: Array<{ displayName: string }> = res.body.groceryList.items;
    expect(updated.find((i) => i.displayName === 'Free Range Eggs')).toBeDefined();
  });

  it('returns 400 for an invalid ObjectId', async () => {
    const res = await request(app)
      .patch(`/api/v1/grocery-lists/${WEEK_START}/items/not-an-id`)
      .set('X-User-Id', USER_A)
      .send({ isPurchased: true });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent item', async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .patch(`/api/v1/grocery-lists/${WEEK_START}/items/${fakeId}`)
      .set('X-User-Id', USER_A)
      .send({ isPurchased: true });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/grocery-lists/:weekStart/items/:itemId', () => {
  it('removes an item', async () => {
    const addRes = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/items`)
      .set('X-User-Id', USER_A)
      .send({ displayName: 'Garlic', quantity: 3, unit: 'count', category: 'Produce' });

    const itemId: string = addRes.body.groceryList.items.find(
      (i: { displayName: string }) => i.displayName === 'Garlic',
    )._id;

    const res = await request(app)
      .delete(`/api/v1/grocery-lists/${WEEK_START}/items/${itemId}`)
      .set('X-User-Id', USER_A);

    expect(res.status).toBe(200);
    const items: Array<{ displayName: string }> = res.body.groceryList.items;
    expect(items.find((i) => i.displayName === 'Garlic')).toBeUndefined();
  });

  it('returns 404 for non-existent item', async () => {
    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .delete(`/api/v1/grocery-lists/${WEEK_START}/items/${fakeId}`)
      .set('X-User-Id', USER_A);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/grocery-lists/:weekStart/complete', () => {
  it('creates inventory items for purchased goods', async () => {
    const fakeItemId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/complete`)
      .set('X-User-Id', USER_A)
      .send({
        items: [
          {
            itemId: fakeItemId,
            name: 'Olive Oil',
            quantity: 1,
            unit: 'bottle',
            category: 'Pantry',
            location: 'pantry',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.created[0].name).toBe('Olive Oil');
    expect(res.body.errors).toHaveLength(0);
  });

  it('creates inventory item with expiresAt when provided', async () => {
    const fakeItemId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/complete`)
      .set('X-User-Id', USER_A)
      .send({
        items: [
          {
            itemId: fakeItemId,
            name: 'Milk',
            quantity: 2,
            unit: 'l',
            category: 'Dairy',
            location: 'fridge',
            expiresAt: '2026-04-20T00:00:00.000Z',
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.created[0].name).toBe('Milk');
    expect(res.body.errors).toHaveLength(0);
  });

  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/complete`)
      .set('X-User-Id', USER_A)
      .send({ items: [{ name: 'Something' }] }); // missing required fields
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/grocery-lists/:weekStart/items/:itemId — additional fields', () => {
  it('updates quantity and unit together', async () => {
    const addRes = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/items`)
      .set('X-User-Id', USER_A)
      .send({ displayName: 'Flour', quantity: 1, unit: 'kg', category: 'Grains' });

    const itemId: string = addRes.body.groceryList.items.find(
      (i: { displayName: string }) => i.displayName === 'Flour',
    )._id;

    const res = await request(app)
      .patch(`/api/v1/grocery-lists/${WEEK_START}/items/${itemId}`)
      .set('X-User-Id', USER_A)
      .send({ quantity: 2, unit: 'kg', notes: 'bread flour' });

    expect(res.status).toBe(200);
    const flour: { quantity: number; unit: string; notes: string } | undefined =
      res.body.groceryList.items.find((i: { displayName: string }) => i.displayName === 'Flour');
    expect(flour?.quantity).toBe(2);
    expect(flour?.notes).toBe('bread flour');
  });

  it('updates category', async () => {
    const addRes = await request(app)
      .post(`/api/v1/grocery-lists/${WEEK_START}/items`)
      .set('X-User-Id', USER_A)
      .send({ displayName: 'Quinoa', quantity: 1, unit: 'cup', category: 'Other' });

    const itemId: string = addRes.body.groceryList.items.find(
      (i: { displayName: string }) => i.displayName === 'Quinoa',
    )._id;

    const res = await request(app)
      .patch(`/api/v1/grocery-lists/${WEEK_START}/items/${itemId}`)
      .set('X-User-Id', USER_A)
      .send({ category: 'Grains' });

    expect(res.status).toBe(200);
    const item: { category: string } | undefined = res.body.groceryList.items.find(
      (i: { displayName: string }) => i.displayName === 'Quinoa',
    );
    expect(item?.category).toBe('Grains');
  });
});

describe('GET /api/v1/grocery-lists/:weekStart — lazy generation with inventory', () => {
  it('generates list even when inventory is empty', async () => {
    await seedMealPlan(USER_A, [validMealEntry]);
    const res = await request(app)
      .get(`/api/v1/grocery-lists/${WEEK_START}`)
      .set('X-User-Id', USER_A);
    expect(res.status).toBe(200);
    expect(res.body.groceryList.items.length).toBeGreaterThan(0);
  });
});
