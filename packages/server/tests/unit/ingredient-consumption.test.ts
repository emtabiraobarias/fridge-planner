import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { InventoryItem } from '../../src/models/inventory-item.js';
import { consumeIngredients } from '../../src/lib/ingredient-consumption.js';

let mongod: MongoMemoryServer;

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

async function seedItem(overrides: Partial<{
  name: string;
  quantity: number;
  expired: boolean;
  userId: string;
}> = {}): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  await InventoryItem.create({
    userId: overrides.userId ?? 'user-1',
    name: overrides.name ?? 'Chicken Breast',
    quantity: overrides.quantity ?? 2,
    unit: 'lbs',
    category: 'Meat',
    location: 'fridge',
    // Use a past expiresAt to trigger the pre-hook and get expirationStatus: 'expired'
    ...(overrides.expired ? { expiresAt: yesterday } : {}),
  });
}

describe('consumeIngredients', () => {
  it('decrements matched item quantity by 1', async () => {
    await seedItem({ quantity: 3 });
    await consumeIngredients('user-1', ['Chicken Breast']);
    const item = await InventoryItem.findOne({ userId: 'user-1', name: 'Chicken Breast' });
    expect(item?.quantity).toBe(2);
  });

  it('is case-insensitive when matching ingredient names', async () => {
    await seedItem({ name: 'chicken breast', quantity: 2 });
    await consumeIngredients('user-1', ['CHICKEN BREAST']);
    const item = await InventoryItem.findOne({ userId: 'user-1' });
    expect(item?.quantity).toBe(1);
  });

  it('deletes item when quantity reaches 0', async () => {
    await seedItem({ quantity: 1 });
    await consumeIngredients('user-1', ['Chicken Breast']);
    const item = await InventoryItem.findOne({ userId: 'user-1', name: 'Chicken Breast' });
    expect(item).toBeNull();
  });

  it('does not decrement below 0', async () => {
    await seedItem({ quantity: 0 });
    await consumeIngredients('user-1', ['Chicken Breast']);
    const item = await InventoryItem.findOne({ userId: 'user-1', name: 'Chicken Breast' });
    // quantity 0 → deletion (treated same as reaching 0)
    expect(item).toBeNull();
  });

  it('does nothing when ingredient name has no inventory match', async () => {
    await seedItem({ name: 'Rice', quantity: 2 });
    await consumeIngredients('user-1', ['Broccoli']);
    const item = await InventoryItem.findOne({ userId: 'user-1', name: 'Rice' });
    expect(item?.quantity).toBe(2);
  });

  it('skips expired items', async () => {
    await seedItem({ quantity: 2, expired: true });
    await consumeIngredients('user-1', ['Chicken Breast']);
    const item = await InventoryItem.findOne({ userId: 'user-1', name: 'Chicken Breast' });
    expect(item?.quantity).toBe(2);
  });

  it('processes multiple ingredients in parallel', async () => {
    await seedItem({ name: 'Chicken Breast', quantity: 2 });
    await seedItem({ name: 'Rice', quantity: 3 });
    await consumeIngredients('user-1', ['Chicken Breast', 'Rice']);
    const chicken = await InventoryItem.findOne({ userId: 'user-1', name: 'Chicken Breast' });
    const rice = await InventoryItem.findOne({ userId: 'user-1', name: 'Rice' });
    expect(chicken?.quantity).toBe(1);
    expect(rice?.quantity).toBe(2);
  });

  it('does not throw when a single ingredient match fails', async () => {
    await consumeIngredients('user-1', ['Nonexistent Ingredient']);
    // no error thrown
  });

  it('only matches items belonging to the given userId', async () => {
    await seedItem({ userId: 'user-99', quantity: 5 });
    await consumeIngredients('user-1', ['Chicken Breast']);
    const item = await InventoryItem.findOne({ userId: 'user-99', name: 'Chicken Breast' });
    expect(item?.quantity).toBe(5);
  });
});
