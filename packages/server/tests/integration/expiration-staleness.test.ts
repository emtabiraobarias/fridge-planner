import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Application } from 'express';
import type { MealRecommendation } from '../../src/types/meal-recommendation.js';

// Mock the agent so the recommendations check never hits holodeck.
const mockMeal: MealRecommendation = {
  mealName: 'Should Not Appear', suggestedMealType: 'dinner', prepTimeMinutes: 10,
  cuisine: 'Test', description: 'x', usesIngredients: [], expiringIngredients: [], missingIngredients: [],
};
jest.unstable_mockModule('../../src/services/meal-recommender.js', () => ({
  getMealRecommendations: jest.fn<() => Promise<MealRecommendation[]>>().mockResolvedValue([mockMeal]),
}));

const { createApp } = await import('../../src/app.js');
const { InventoryItem } = await import('../../src/models/inventory-item.js');
const { getMealRecommendations } = await import('../../src/services/meal-recommender.js');
const mockGet = getMealRecommendations as jest.MockedFunction<typeof getMealRecommendations>;

let mongod: MongoMemoryServer;
let app: Application;
const U = 'stale-user';
const item = { name: 'Milk', quantity: 1, unit: 'L', category: 'Dairy', location: 'fridge' };

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

// Creates an item that is TRULY expired (expiresAt = yesterday) but whose PERSISTED
// expirationStatus is left stale at 'normal' — simulating an item that aged past its
// boundary without being re-saved (the BUG #6 condition). Uses the raw driver to bypass hooks.
async function createStaleExpired(): Promise<string> {
  const far = new Date(); far.setDate(far.getDate() + 10);
  const created = await request(app)
    .post('/api/v1/inventory').set('X-User-Id', U)
    .send({ ...item, expiresAt: far.toISOString() }); // stored 'normal'
  const id = created.body._id as string;
  const yesterday = new Date(); yesterday.setHours(12, 0, 0, 0); yesterday.setDate(yesterday.getDate() - 1);
  await InventoryItem.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { $set: { expiresAt: yesterday, expirationStatus: 'normal' } }, // stale: truly expired, stored 'normal'
  );
  return id;
}

describe('Expiration status is derived on read (BUG #6 / FR-006/007, SC-014)', () => {
  it('GET /inventory reports the derived status, not the stale stored one', async () => {
    await createStaleExpired();
    const res = await request(app).get('/api/v1/inventory').set('X-User-Id', U);
    expect(res.status).toBe(200);
    expect(res.body.items[0].expirationStatus).toBe('expired'); // not the stored 'normal'
  });

  it('GET /inventory summary counts it as expired (date-based)', async () => {
    await createStaleExpired();
    const res = await request(app).get('/api/v1/inventory').set('X-User-Id', U);
    expect(res.body.summary.expired).toBe(1);
  });

  it('GET /inventory?status=expired returns the stale-expired item', async () => {
    await createStaleExpired();
    const res = await request(app).get('/api/v1/inventory?status=expired').set('X-User-Id', U);
    expect(res.body.items).toHaveLength(1);
  });

  it('recommendations exclude the stale-expired item (SC-014 food safety)', async () => {
    await createStaleExpired(); // only inventory item is truly expired
    const res = await request(app).post('/api/v1/recommendations').set('X-User-Id', U).send({});
    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe('popular'); // nothing non-expired → fallback, not the expired item
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('a genuinely non-expired item is still included + labelled correctly', async () => {
    const tomorrow = new Date(); tomorrow.setHours(12, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 1);
    await request(app).post('/api/v1/inventory').set('X-User-Id', U)
      .send({ ...item, name: 'Fresh Milk', expiresAt: tomorrow.toISOString() });
    const inv = await request(app).get('/api/v1/inventory').set('X-User-Id', U);
    expect(inv.body.items[0].expirationStatus).toBe('expiring-soon');
    expect(inv.body.summary.expiringSoon).toBe(1);
  });
});
