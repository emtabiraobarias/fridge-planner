import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Application } from 'express';
import { createApp } from '../../src/app.js';

let mongod: MongoMemoryServer;
const app: Application = createApp();
const U = 'consume-user';
const WEEK = '2026-06-08T00:00:00.000Z';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function addInv(name: string, quantity: number): Promise<void> {
  await request(app).post('/api/v1/inventory').set('X-User-Id', U)
    .send({ name, quantity, unit: 'pcs', category: 'Other', location: 'fridge' });
}
async function qty(name: string): Promise<number | null> {
  const res = await request(app).get('/api/v1/inventory').set('X-User-Id', U);
  const it = res.body.items.find((i: { name: string }) => i.name === name);
  return it ? it.quantity : null;
}
function entry(uses: string[]): Record<string, unknown> {
  return {
    slotId: randomUUID(), date: '2026-06-08T18:00:00.000Z', mealType: 'dinner',
    meal: {
      mealName: 'M', suggestedMealType: 'dinner', prepTimeMinutes: 10, cuisine: 'T',
      description: 'x', usesIngredients: uses, expiringIngredients: [], missingIngredients: [],
    },
  };
}
const postEntry = (e: Record<string, unknown>) =>
  request(app).post(`/api/v1/meal-plans/${WEEK}/entries`).set('X-User-Id', U).send(e);
const delEntry = (slotId: string) =>
  request(app).delete(`/api/v1/meal-plans/${WEEK}/entries/${slotId}`).set('X-User-Id', U);

describe('Reversible / idempotent meal-plan consumption (BUG #7, FR-005)', () => {
  it('removing a planned meal restores its consumed ingredients', async () => {
    await addInv('beef', 5);
    const e = entry(['beef']);
    await postEntry(e);
    expect(await qty('beef')).toBe(4); // consumed on add (awaited)
    await delEntry(e.slotId as string);
    expect(await qty('beef')).toBe(5); // restored on remove
  });

  it('add/remove is balanced with duplicates', async () => {
    await addInv('beef', 5);
    const e1 = entry(['beef']);
    const e2 = entry(['beef']);
    await postEntry(e1);
    await postEntry(e2);
    expect(await qty('beef')).toBe(3); // two meals → −2
    await delEntry(e1.slotId as string);
    expect(await qty('beef')).toBe(4); // removing one restores exactly one
  });

  it('PUT replace nets out: old entries restored, new entries consumed', async () => {
    await addInv('beef', 5);
    await addInv('rice', 5);
    await postEntry(entry(['beef'])); // beef 5→4
    expect(await qty('beef')).toBe(4);

    await request(app).put(`/api/v1/meal-plans/${WEEK}`).set('X-User-Id', U)
      .send({ entries: [entry(['rice'])] }); // replace beef-meal with rice-meal

    expect(await qty('beef')).toBe(5); // beef restored
    expect(await qty('rice')).toBe(4); // rice consumed
  });
});
