// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const USER_A = 'user-a';
const USER_B = 'user-b';

let mongod: MongoMemoryServer;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let findMergeTarget: typeof import('@server/lib/inventory-merge').findMergeTarget;
let mergeInto: typeof import('@server/lib/inventory-merge').mergeInto;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ findMergeTarget, mergeInto } = await import('@server/lib/inventory-merge'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('findMergeTarget (spec 009 T026, extracted from spec 007 FR-GC-005 matcher)', () => {
  it('returns a same-name, non-expired, compatible-unit item', async () => {
    const existing = await InventoryItem.create({
      userId: USER_A,
      name: 'Milk',
      quantity: 1,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
    });

    const target = await findMergeTarget(USER_A, 'Milk', 'L');

    expect(target).not.toBeNull();
    expect(String(target?._id)).toBe(String(existing._id));
  });

  it('returns null when the same-name item is expired', async () => {
    await InventoryItem.create({
      userId: USER_A,
      name: 'Milk',
      quantity: 1,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    expect(await findMergeTarget(USER_A, 'Milk', 'L')).toBeNull();
  });

  it('returns null when the same-name item has an incompatible unit', async () => {
    await InventoryItem.create({
      userId: USER_A,
      name: 'Stock',
      quantity: 1,
      unit: 'L',
      category: 'Pantry',
      location: 'pantry',
    });

    expect(await findMergeTarget(USER_A, 'Stock', 'g')).toBeNull();
  });

  it('returns null when no same-name item exists', async () => {
    expect(await findMergeTarget(USER_A, 'Nonexistent', 'count')).toBeNull();
  });

  it('never returns another user’s item', async () => {
    await InventoryItem.create({
      userId: USER_B,
      name: 'Milk',
      quantity: 1,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
    });

    expect(await findMergeTarget(USER_A, 'Milk', 'L')).toBeNull();
  });
});

describe('mergeInto (spec 009 T026)', () => {
  it('increments the target quantity by the given amount', async () => {
    const target = await InventoryItem.create({
      userId: USER_A,
      name: 'Milk',
      quantity: 1,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
    });

    const added = await mergeInto(target, 2, 'L');

    expect(added).toBe(2);
    const reloaded = await InventoryItem.findById(target._id);
    expect(reloaded?.quantity).toBe(3);
  });

  it('unit-converts the incoming quantity to the target’s unit before incrementing', async () => {
    const target = await InventoryItem.create({
      userId: USER_A,
      name: 'Stock',
      quantity: 1,
      unit: 'L',
      category: 'Pantry',
      location: 'pantry',
    });

    // 500 mL should convert to 0.5 L against a Litre-denominated target.
    const added = await mergeInto(target, 500, 'ml');

    expect(added).toBe(0.5);
    const reloaded = await InventoryItem.findById(target._id);
    expect(reloaded?.quantity).toBe(1.5);
  });
});
