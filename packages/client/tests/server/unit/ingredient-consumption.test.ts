// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const USER = 'consume-user-a';

let mongod: MongoMemoryServer;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let consumeConfirmed: typeof import('@server/lib/ingredient-consumption').consumeConfirmed;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ consumeConfirmed } = await import('@server/lib/ingredient-consumption'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

async function seed(name: string, quantity: number, unit = 'g'): Promise<string> {
  const item = await InventoryItem.create({
    userId: USER,
    name,
    quantity,
    unit,
    category: 'Meat',
    location: 'fridge',
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
  });
  return String(item._id);
}

async function qty(name: string): Promise<number | null> {
  const item = await InventoryItem.findOne({ userId: USER, name });
  return item?.quantity ?? null;
}

describe('consumeConfirmed (spec 006 FR-MC-009/012)', () => {
  it('deducts by inventoryItemId and records the receipt line', async () => {
    const id = await seed('Chicken Thighs', 1000, 'g');
    const receipt = await consumeConfirmed(USER, [
      { inventoryItemId: id, name: 'Chicken Thighs', quantity: 250, unit: 'g' },
    ]);
    expect(await qty('Chicken Thighs')).toBe(750);
    expect(receipt).toHaveLength(1);
    expect(receipt[0]).toMatchObject({
      inventoryItemId: id,
      name: 'Chicken Thighs',
      quantityConsumed: 250,
      unit: 'g',
    });
    expect(receipt[0]!.depletedSnapshot).toBeUndefined();
  });

  it('converts compatible units into the item unit (kg line vs g item)', async () => {
    await seed('Chicken Thighs', 1000, 'g');
    const receipt = await consumeConfirmed(USER, [
      { name: 'chicken thighs', quantity: 0.5, unit: 'kg' },
    ]);
    expect(await qty('Chicken Thighs')).toBe(500);
    expect(receipt[0]!.quantityConsumed).toBe(500);
    expect(receipt[0]!.unit).toBe('g');
  });

  it('falls back to a case-insensitive name match when no id is given', async () => {
    await seed('Rice', 3, 'units');
    await consumeConfirmed(USER, [{ name: 'rice', quantity: 1, unit: 'units' }]);
    expect(await qty('Rice')).toBe(2);
  });

  it('clamps to the live quantity — never negative (FR-MC-002)', async () => {
    const id = await seed('Milk', 1000, 'ml');
    const receipt = await consumeConfirmed(USER, [
      { inventoryItemId: id, name: 'Milk', quantity: 5000, unit: 'ml' },
    ]);
    expect(await qty('Milk')).toBeNull(); // fully consumed → removed
    expect(receipt[0]!.quantityConsumed).toBe(1000);
  });

  it('records a zeroed line as not consumed, deducting nothing', async () => {
    const id = await seed('Soy Sauce', 500, 'ml');
    const receipt = await consumeConfirmed(USER, [
      { inventoryItemId: id, name: 'Soy Sauce', quantity: 0, unit: 'ml' },
    ]);
    expect(await qty('Soy Sauce')).toBe(500);
    expect(receipt[0]!.quantityConsumed).toBe(0);
  });

  it('captures a depletedSnapshot (without expirationStatus) when deduction removes the item', async () => {
    const id = await seed('Eggs', 6, 'count');
    const receipt = await consumeConfirmed(USER, [
      { inventoryItemId: id, name: 'Eggs', quantity: 6, unit: 'count' },
    ]);
    expect(await qty('Eggs')).toBeNull();
    const snap = receipt[0]!.depletedSnapshot!;
    expect(snap).toMatchObject({ name: 'Eggs', quantity: 6, unit: 'count', category: 'Meat', location: 'fridge' });
    expect(snap.expiresAt).toBeInstanceOf(Date);
    expect('expirationStatus' in (snap as Record<string, unknown>)).toBe(false);
  });

  it('deducts one item-unit for an incompatible-unit line (legacy rule, FR-MC-009)', async () => {
    const id = await seed('Butter', 3, 'units');
    const receipt = await consumeConfirmed(USER, [
      { inventoryItemId: id, name: 'Butter', quantity: 2, unit: 'L' },
    ]);
    expect(await qty('Butter')).toBe(2);
    expect(receipt[0]!.quantityConsumed).toBe(1);
    expect(receipt[0]!.unit).toBe('units');
  });

  it('records an unmatched line as not consumed and touches nothing (FR-MC-009/012)', async () => {
    await seed('Chicken', 3, 'units');
    const receipt = await consumeConfirmed(USER, [
      { name: 'dragon fruit', quantity: 2, unit: 'count' },
    ]);
    expect(await qty('Chicken')).toBe(3);
    expect(receipt[0]!.quantityConsumed).toBe(0);
    expect(receipt[0]!.inventoryItemId).toBeUndefined();
  });

  it("never touches another user's inventory (FR-036)", async () => {
    const foreign = await InventoryItem.create({
      userId: 'someone-else',
      name: 'Chicken',
      quantity: 5,
      unit: 'units',
      category: 'Meat',
      location: 'fridge',
    });
    const receipt = await consumeConfirmed(USER, [
      { inventoryItemId: String(foreign._id), name: 'Chicken', quantity: 2, unit: 'units' },
    ]);
    expect((await InventoryItem.findById(foreign._id))!.quantity).toBe(5);
    expect(receipt[0]!.quantityConsumed).toBe(0);
  });
});
