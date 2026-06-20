import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Application } from 'express';

// Mock consumeIngredients so it doesn't actually hit the DB in integration tests
// (we verify it's called, not that it works — that's covered by unit tests)
jest.unstable_mockModule('../../src/lib/ingredient-consumption.js', () => ({
  consumeIngredients: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  restoreIngredients: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

const { createApp } = await import('../../src/app.js');
const { consumeIngredients } = await import('../../src/lib/ingredient-consumption.js');
const mockConsumeIngredients = consumeIngredients as jest.MockedFunction<typeof consumeIngredients>;

let mongod: MongoMemoryServer;
let app: Application;

const WEEK_START = '2026-04-06T00:00:00.000Z';
const WEEK_START_2 = '2026-04-13T00:00:00.000Z';

const validEntry = {
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
    missingIngredients: [],
  },
};

const secondEntry = {
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
    missingIngredients: ['croutons'],
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
  mockConsumeIngredients.mockClear();
});

describe('GET /api/v1/meal-plans', () => {
  it('returns { plan: null } when no plan exists for the week', async () => {
    const res = await request(app).get(`/api/v1/meal-plans?weekStart=${WEEK_START}`);
    expect(res.status).toBe(200);
    expect(res.body.plan).toBeNull();
  });

  it('returns the plan document when one exists', async () => {
    await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send(validEntry);

    const res = await request(app).get(`/api/v1/meal-plans?weekStart=${WEEK_START}`);
    expect(res.status).toBe(200);
    expect(res.body.plan).not.toBeNull();
    expect(res.body.plan.entries).toHaveLength(1);
    expect(res.body.plan.entries[0].slotId).toBe(validEntry.slotId);
  });

  it('returns 400 when weekStart query param is missing', async () => {
    const res = await request(app).get('/api/v1/meal-plans');
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid weekStart format', async () => {
    const res = await request(app).get('/api/v1/meal-plans?weekStart=not-a-date');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/meal-plans/:weekStart/entries', () => {
  it('creates a new plan and entry, returns 201', async () => {
    const res = await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send(validEntry);
    expect(res.status).toBe(201);
    expect(res.body.plan.entries).toHaveLength(1);
    expect(res.body.plan.entries[0].mealType).toBe('dinner');
    expect(res.body.plan.weekStart).toBeDefined();
  });

  it('appends a second entry to an existing plan for the same week', async () => {
    await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send(validEntry);

    const res = await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send(secondEntry);

    expect(res.status).toBe(201);
    expect(res.body.plan.entries).toHaveLength(2);
  });

  it('creates separate plans for different weeks', async () => {
    await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send(validEntry);

    const res = await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START_2}/entries`)
      .send({ ...validEntry, slotId: 'c3d4e5f6-a7b8-9012-cdef-123456789012' });

    expect(res.status).toBe(201);
    expect(res.body.plan.entries).toHaveLength(1);
  });

  it('returns 400 for an invalid slotId (not a UUID)', async () => {
    const res = await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send({ ...validEntry, slotId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe(400);
  });

  it('returns 400 for an invalid mealType', async () => {
    const res = await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send({ ...validEntry, mealType: 'brunch' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing required meal fields', async () => {
    const res = await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send({ ...validEntry, meal: { mealName: 'Only Name' } });
    expect(res.status).toBe(400);
  });

  it('calls consumeIngredients with the meal usesIngredients', async () => {
    await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send(validEntry);

    // Allow any pending microtasks to flush
    await new Promise((r) => setImmediate(r));
    expect(mockConsumeIngredients).toHaveBeenCalledWith(
      'anonymous',
      validEntry.meal.usesIngredients,
    );
  });

  it('accepts "snack" as a valid mealType', async () => {
    const res = await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send({ ...validEntry, mealType: 'snack' });
    expect(res.status).toBe(201);
    expect(res.body.plan.entries[0].mealType).toBe('snack');
  });
});

describe('DELETE /api/v1/meal-plans/:weekStart/entries/:slotId', () => {
  it('removes an entry and returns 200 with updated plan', async () => {
    await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send(validEntry);
    await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send(secondEntry);

    const res = await request(app).delete(
      `/api/v1/meal-plans/${WEEK_START}/entries/${validEntry.slotId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.plan.entries).toHaveLength(1);
    expect(res.body.plan.entries[0].slotId).toBe(secondEntry.slotId);
  });

  it('returns 404 when slotId is not found', async () => {
    await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send(validEntry);

    const res = await request(app).delete(
      `/api/v1/meal-plans/${WEEK_START}/entries/00000000-0000-0000-0000-000000000000`,
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when no plan exists for the week', async () => {
    const res = await request(app).delete(
      `/api/v1/meal-plans/${WEEK_START}/entries/${validEntry.slotId}`,
    );
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/meal-plans/:weekStart', () => {
  it('replaces all entries and returns 200', async () => {
    await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send(validEntry);

    const res = await request(app)
      .put(`/api/v1/meal-plans/${WEEK_START}`)
      .send({ entries: [secondEntry] });

    expect(res.status).toBe(200);
    expect(res.body.plan.entries).toHaveLength(1);
    expect(res.body.plan.entries[0].slotId).toBe(secondEntry.slotId);
  });

  it('upserts (creates the plan if it did not exist)', async () => {
    const res = await request(app)
      .put(`/api/v1/meal-plans/${WEEK_START}`)
      .send({ entries: [validEntry] });

    expect(res.status).toBe(200);
    expect(res.body.plan.entries).toHaveLength(1);
  });

  it('can replace with an empty entries array', async () => {
    await request(app)
      .post(`/api/v1/meal-plans/${WEEK_START}/entries`)
      .send(validEntry);

    const res = await request(app)
      .put(`/api/v1/meal-plans/${WEEK_START}`)
      .send({ entries: [] });

    expect(res.status).toBe(200);
    expect(res.body.plan.entries).toHaveLength(0);
  });

  it('returns 400 for invalid entry in the entries array', async () => {
    const res = await request(app)
      .put(`/api/v1/meal-plans/${WEEK_START}`)
      .send({ entries: [{ ...validEntry, slotId: 'bad-uuid' }] });
    expect(res.status).toBe(400);
  });
});
