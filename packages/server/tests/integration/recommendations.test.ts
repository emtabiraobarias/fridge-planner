import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Application } from 'express';
import type { MealRecommendation } from '../../src/types/meal-recommendation.js';

const mockMeal: MealRecommendation = {
  mealName: 'Chicken Stir-fry',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 20,
  cuisine: 'Asian',
  description: 'Quick stir-fry using chicken before it expires.',
  usesIngredients: ['chicken breast'],
  expiringIngredients: ['chicken breast'],
  missingIngredients: [],
};

// Must mock before dynamic import of app (ESM mock hoisting requirement)
jest.unstable_mockModule('../../src/services/meal-recommender.js', () => ({
  getMealRecommendations: jest.fn<() => Promise<MealRecommendation[]>>().mockResolvedValue([mockMeal]),
}));

// Dynamic imports AFTER mock registration
const { createApp } = await import('../../src/app.js');
const { getMealRecommendations } = await import('../../src/services/meal-recommender.js');
const mockGetRecommendations = getMealRecommendations as jest.MockedFunction<typeof getMealRecommendations>;

let mongod: MongoMemoryServer;
let app: Application;

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
  mockGetRecommendations.mockClear();
});

async function seedItem(overrides: Record<string, unknown> = {}): Promise<void> {
  await request(app).post('/api/v1/inventory').send({
    name: 'Chicken Breast',
    quantity: 2,
    unit: 'lbs',
    category: 'Meat',
    location: 'fridge',
    ...overrides,
  });
}

describe('POST /api/v1/recommendations', () => {
  it('calls holodeck with non-expired inventory items and returns meal array', async () => {
    await seedItem();
    const res = await request(app).post('/api/v1/recommendations').send({});
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recommendations)).toBe(true);
    expect(res.body.recommendations[0]).toMatchObject({ mealName: 'Chicken Stir-fry' });
    expect(mockGetRecommendations).toHaveBeenCalledTimes(1);
  });

  it('excludes expired items from the holodeck call (FR-007)', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await seedItem();
    await seedItem({ name: 'Old Milk', category: 'Dairy', expiresAt: yesterday.toISOString() });

    await request(app).post('/api/v1/recommendations').send({});

    const callArg = mockGetRecommendations.mock.calls[0]?.[0];
    expect(Array.isArray(callArg)).toBe(true);
    const names = (callArg as Array<{ name: string }>).map((i) => i.name);
    expect(names).toContain('Chicken Breast');
    expect(names).not.toContain('Old Milk');
  });

  it('passes dietary preferences to holodeck', async () => {
    await seedItem();
    await request(app)
      .post('/api/v1/recommendations')
      .send({ dietaryPreferences: ['vegetarian', 'gluten-free'] });

    expect(mockGetRecommendations).toHaveBeenCalledWith(
      expect.any(Array),
      expect.arrayContaining(['vegetarian', 'gluten-free']),
    );
  });

  it('returns empty array when inventory is empty (no holodeck call)', async () => {
    const res = await request(app).post('/api/v1/recommendations').send({});
    expect(res.status).toBe(200);
    expect(mockGetRecommendations).not.toHaveBeenCalled();
    expect(res.body.recommendations).toEqual([]);
  });
});
