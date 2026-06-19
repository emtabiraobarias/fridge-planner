import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Application } from 'express';
import type { MealRecommendation } from '../../src/types/meal-recommendation.js';

const realMeal: MealRecommendation = {
  mealName: 'Real Agent Meal', suggestedMealType: 'dinner', prepTimeMinutes: 20,
  cuisine: 'Test', description: 'x', usesIngredients: ['chicken breast'], expiringIngredients: [], missingIngredients: [],
};
jest.unstable_mockModule('../../src/services/meal-recommender.js', () => ({
  getMealRecommendations: jest.fn<() => Promise<MealRecommendation[]>>(),
}));

const { createApp } = await import('../../src/app.js');
const { getMealRecommendations } = await import('../../src/services/meal-recommender.js');
const { invalidateUser } = await import('../../src/services/recommendations-cache.js');
const mockGet = getMealRecommendations as jest.MockedFunction<typeof getMealRecommendations>;

let mongod: MongoMemoryServer;
let app: Application;
const U = 'fallback-user';
const item = { name: 'chicken breast', quantity: 2, unit: 'lbs', category: 'Meat', location: 'fridge' };

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
  mockGet.mockReset();
  invalidateUser(U); // clear cache between tests
});

const recommend = (): request.Test =>
  request(app).post('/api/v1/recommendations').set('X-User-Id', U).send({});

describe('Graceful recommendation fallback (EC-01, EC-08, SC-010)', () => {
  it('EC-01: empty inventory → popular recipes (not an empty list)', async () => {
    const res = await recommend();
    expect(res.status).toBe(200);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
    expect(res.body.fallback).toBe('popular');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('EC-08/SC-010: agent failure → 200 with popular-recipe fallback (not 500)', async () => {
    await request(app).post('/api/v1/inventory').set('X-User-Id', U).send(item);
    mockGet.mockRejectedValue(new Error('holodeck unreachable'));
    const res = await recommend();
    expect(res.status).toBe(200);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
    expect(res.body.fallback).toBe('popular');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('happy path still returns the agent result untouched (no fallback flag)', async () => {
    await request(app).post('/api/v1/inventory').set('X-User-Id', U).send(item);
    mockGet.mockResolvedValue([realMeal]);
    const res = await recommend();
    expect(res.status).toBe(200);
    expect(res.body.recommendations).toHaveLength(1);
    expect(res.body.recommendations[0].mealName).toBe('Real Agent Meal');
    expect(res.body.fallback).toBeUndefined();
  });
});
