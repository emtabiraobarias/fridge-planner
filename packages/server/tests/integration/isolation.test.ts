import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Application } from 'express';
import type { MealRecommendation } from '../../src/types/meal-recommendation.js';

// Mock the agent so the recommendations isolation check never hits holodeck.
const mockMeal: MealRecommendation = {
  mealName: 'Should Not Appear',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 10,
  cuisine: 'Test',
  description: 'x',
  usesIngredients: ['chicken breast'],
  expiringIngredients: [],
  missingIngredients: [],
};
jest.unstable_mockModule('../../src/services/meal-recommender.js', () => ({
  getMealRecommendations: jest.fn<() => Promise<MealRecommendation[]>>().mockResolvedValue([mockMeal]),
}));

const { createApp } = await import('../../src/app.js');
const { getMealRecommendations } = await import('../../src/services/meal-recommender.js');
const mockGet = getMealRecommendations as jest.MockedFunction<typeof getMealRecommendations>;

let mongod: MongoMemoryServer;
let app: Application;

const item = { name: 'Chicken Breast', quantity: 2, unit: 'lbs', category: 'Meat', location: 'fridge' };

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
  mockGet.mockClear();
});

// Creates an item owned by `user`, returns its id.
async function createFor(user: string): Promise<string> {
  const res = await request(app).post('/api/v1/inventory').set('X-User-Id', user).send(item);
  return res.body._id as string;
}

describe('Per-user data isolation (FR-036)', () => {
  it('GET /inventory returns only the requesting user\'s items', async () => {
    await createFor('userA');
    const res = await request(app).get('/api/v1/inventory').set('X-User-Id', 'userB');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.summary.total).toBe(0);
  });

  it('GET /inventory still returns the owner\'s own items', async () => {
    await createFor('userA');
    const res = await request(app).get('/api/v1/inventory').set('X-User-Id', 'userA');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.summary.total).toBe(1);
  });

  it('PUT /inventory/:id cannot modify another user\'s item', async () => {
    const id = await createFor('userA');
    const res = await request(app)
      .put(`/api/v1/inventory/${id}`)
      .set('X-User-Id', 'userB')
      .send({ quantity: 99 });
    expect(res.status).toBe(404);
    const owner = await request(app).get('/api/v1/inventory').set('X-User-Id', 'userA');
    expect(owner.body.items[0].quantity).toBe(item.quantity); // unchanged
  });

  it('DELETE /inventory/:id cannot remove another user\'s item', async () => {
    const id = await createFor('userA');
    const res = await request(app).delete(`/api/v1/inventory/${id}`).set('X-User-Id', 'userB');
    expect(res.status).toBe(404);
    const owner = await request(app).get('/api/v1/inventory').set('X-User-Id', 'userA');
    expect(owner.body.items).toHaveLength(1); // still there
  });

  it('POST /recommendations uses only the requesting user\'s inventory', async () => {
    await createFor('userA'); // only userA has stock
    const res = await request(app)
      .post('/api/v1/recommendations')
      .set('X-User-Id', 'userB')
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.recommendations).toEqual([]); // userB has nothing
    expect(mockGet).not.toHaveBeenCalled(); // agent never asked with another user's items
  });
});
