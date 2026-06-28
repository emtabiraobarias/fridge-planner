import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import type { Application } from 'express';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWK } from 'jose';

const ISS = 'https://issuer.test';
const AUD = 'fridge-planner';
const WEEK = '2026-06-29T00:00:00.000Z';
const SLOT = '11111111-2222-3333-4444-555555555555';

const { createApp } = await import('../../src/app.js');

let mongod: MongoMemoryServer;
let app: Application;
let privateKey: CryptoKey;
let tokenA: string;
let tokenB: string;

async function mkToken(sub: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(sub).setIssuer(ISS).setAudience(AUD).setIssuedAt().setExpirationTime('10m')
    .sign(privateKey);
}
const bearer = (t: string): string => `Bearer ${t}`;

const ITEM = { name: 'Chicken Breast', quantity: 2, unit: 'lbs', category: 'Meat', location: 'fridge' };
const ENTRY = {
  slotId: SLOT, date: WEEK, mealType: 'dinner',
  meal: { mealName: 'M', suggestedMealType: 'dinner', prepTimeMinutes: 10, cuisine: 'x', description: 'x', usesIngredients: [], expiringIngredients: [], missingIngredients: [] },
};

beforeAll(async () => {
  process.env['AUTH_MODE'] = 'oidc';
  process.env['AUTH_ISSUER'] = ISS;
  process.env['AUTH_AUDIENCE'] = AUD;
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp();
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  const jwk = (await exportJWK(kp.publicKey)) as JWK;
  jwk.kid = 'test';
  jwk.alg = 'RS256';
  (globalThis as unknown as { _authJwks?: unknown })._authJwks = createLocalJWKSet({ keys: [jwk] });
  tokenA = await mkToken('user-a');
  tokenB = await mkToken('user-b');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  delete process.env['AUTH_MODE'];
  delete process.env['AUTH_ISSUER'];
  delete process.env['AUTH_AUDIENCE'];
});
beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('Auth enforcement (oidc) — FR-D-001/005, SC-D-001', () => {
  it('401 without a token', async () => {
    expect((await request(app).get('/api/v1/inventory')).status).toBe(401);
  });
  it('401 with a garbage token', async () => {
    expect((await request(app).get('/api/v1/inventory').set('Authorization', 'Bearer nope')).status).toBe(401);
  });
  it('/health stays public (FR-D-006)', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
  });
});

describe('Token identity drives scoping — FR-D-003, SC-D-002', () => {
  it('scopes to token sub; another user sees nothing', async () => {
    expect((await request(app).post('/api/v1/inventory').set('Authorization', bearer(tokenA)).send(ITEM)).status).toBe(201);
    const a = await request(app).get('/api/v1/inventory').set('Authorization', bearer(tokenA));
    const b = await request(app).get('/api/v1/inventory').set('Authorization', bearer(tokenB));
    expect(a.body.summary.total).toBe(1);
    expect(b.body.summary.total).toBe(0);
  });
});

describe('No cross-user access (404) across resource types — FR-D-004/036, SC-D-002', () => {
  it('inventory: B cannot update A’s item', async () => {
    const created = await request(app).post('/api/v1/inventory').set('Authorization', bearer(tokenA)).send(ITEM);
    const res = await request(app).put(`/api/v1/inventory/${created.body._id}`).set('Authorization', bearer(tokenB)).send({ quantity: 9 });
    expect(res.status).toBe(404);
  });
  it('meal-plans: B cannot delete A’s entry', async () => {
    await request(app).post(`/api/v1/meal-plans/${WEEK}/entries`).set('Authorization', bearer(tokenA)).send(ENTRY);
    const res = await request(app).delete(`/api/v1/meal-plans/${WEEK}/entries/${SLOT}`).set('Authorization', bearer(tokenB));
    expect(res.status).toBe(404);
  });
  it('grocery-lists: B cannot patch A’s item', async () => {
    const list = await request(app).post(`/api/v1/grocery-lists/${WEEK}/items`).set('Authorization', bearer(tokenA))
      .send({ displayName: 'Bread', quantity: 1, unit: 'loaf', category: 'Grains' });
    const itemId = list.body.groceryList.items[0]._id;
    const res = await request(app).patch(`/api/v1/grocery-lists/${WEEK}/items/${itemId}`).set('Authorization', bearer(tokenB)).send({ isPurchased: true });
    expect(res.status).toBe(404);
  });
});
