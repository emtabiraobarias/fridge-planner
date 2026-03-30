import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { createApp } from '../../src/app.js';

let mongod: MongoMemoryServer;
const app = createApp();

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

const validItem = {
  name: 'Chicken Breast',
  quantity: 2,
  unit: 'lbs',
  category: 'Meat',
  location: 'fridge',
};

describe('POST /api/v1/inventory', () => {
  it('creates an item and returns 201 with expirationStatus "none"', async () => {
    const res = await request(app).post('/api/v1/inventory').send(validItem);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Chicken Breast');
    expect(res.body.expirationStatus).toBe('none');
    expect(res.body._id).toBeDefined();
  });

  it('computes "expiring-soon" for an item expiring tomorrow', async () => {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const res = await request(app)
      .post('/api/v1/inventory')
      .send({ ...validItem, expiresAt: tomorrow.toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.expirationStatus).toBe('expiring-soon');
  });

  it('computes "expired" for an item that expired yesterday', async () => {
    const yesterday = new Date();
    yesterday.setHours(0, 0, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);
    const res = await request(app)
      .post('/api/v1/inventory')
      .send({ ...validItem, expiresAt: yesterday.toISOString() });
    expect(res.status).toBe(201);
    expect(res.body.expirationStatus).toBe('expired');
  });

  it('returns 400 for missing required fields', async () => {
    const res = await request(app).post('/api/v1/inventory').send({ name: 'Milk' });
    expect(res.status).toBe(400);
    expect(res.body.status).toBe(400);
  });

  it('returns 400 for an invalid category', async () => {
    const res = await request(app)
      .post('/api/v1/inventory')
      .send({ ...validItem, category: 'Snacks' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/inventory', () => {
  it('returns an empty array when no items exist', async () => {
    const res = await request(app).get('/api/v1/inventory');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('returns all items including expired ones', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await request(app).post('/api/v1/inventory').send(validItem);
    await request(app)
      .post('/api/v1/inventory')
      .send({ ...validItem, name: 'Old Milk', expiresAt: yesterday.toISOString() });

    const res = await request(app).get('/api/v1/inventory');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.summary.expired).toBe(1);
    expect(res.body.summary.expiringSoon).toBe(0);
    expect(res.body.summary.total).toBe(2);
  });

  it('filters by category', async () => {
    await request(app).post('/api/v1/inventory').send(validItem);
    await request(app)
      .post('/api/v1/inventory')
      .send({ ...validItem, name: 'Carrots', category: 'Produce' });

    const res = await request(app).get('/api/v1/inventory?category=Produce');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('Carrots');
  });

  it('filters by expiration status', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await request(app).post('/api/v1/inventory').send(validItem);
    await request(app)
      .post('/api/v1/inventory')
      .send({ ...validItem, name: 'Old Milk', expiresAt: yesterday.toISOString() });

    const res = await request(app).get('/api/v1/inventory?status=expired');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('Old Milk');
  });
});

describe('PUT /api/v1/inventory/:id', () => {
  it('updates an item and returns the updated document', async () => {
    const created = await request(app).post('/api/v1/inventory').send(validItem);
    const id = created.body._id as string;

    const res = await request(app)
      .put(`/api/v1/inventory/${id}`)
      .send({ quantity: 3, unit: 'kg' });
    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(3);
    expect(res.body.unit).toBe('kg');
  });

  it('returns 404 for a non-existent id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .put(`/api/v1/inventory/${fakeId}`)
      .send({ quantity: 1 });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/inventory/:id', () => {
  it('deletes an item and returns 204', async () => {
    const created = await request(app).post('/api/v1/inventory').send(validItem);
    const id = created.body._id as string;

    const del = await request(app).delete(`/api/v1/inventory/${id}`);
    expect(del.status).toBe(204);

    const get = await request(app).get('/api/v1/inventory');
    expect(get.body.items).toHaveLength(0);
  });

  it('returns 404 for a non-existent id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).delete(`/api/v1/inventory/${fakeId}`);
    expect(res.status).toBe(404);
  });
});
