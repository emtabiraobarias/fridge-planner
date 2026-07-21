// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IGroceryListItem } from '@server/types/grocery-list';

const USER_A = 'user-a';
const USER_B = 'user-b';

let mongod: MongoMemoryServer;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let IngredientAlias: typeof import('@server/models/ingredient-alias').IngredientAlias;
let applyPurchase: typeof import('@server/lib/purchase-inventory').applyPurchase;
let reversePurchase: typeof import('@server/lib/purchase-inventory').reversePurchase;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ IngredientAlias } = await import('@server/models/ingredient-alias'));
  ({ applyPurchase, reversePurchase } = await import('@server/lib/purchase-inventory'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

function line(overrides: Partial<IGroceryListItem> = {}): IGroceryListItem {
  return {
    ingredientName: 'milk',
    displayName: 'Milk',
    quantity: 2,
    unit: 'L',
    category: 'Dairy',
    isPurchased: false,
    isManuallyAdded: false,
    sourceMealNames: [],
    notes: '',
    ...overrides,
  };
}

describe('applyPurchase (spec 007 FR-GC-001..006/013)', () => {
  it('adds a real-amount line exactly and defaults location from category (FR-GC-001/006)', async () => {
    const receipt = await applyPurchase(USER_A, line({ displayName: 'Olive Oil', unit: 'bottle', category: 'Pantry' }));

    const item = await InventoryItem.findById(receipt.inventoryItemId);
    expect(item?.name).toBe('Olive Oil');
    expect(item?.quantity).toBe(2);
    expect(item?.unit).toBe('bottle');
    expect(item?.location).toBe('pantry');
    expect(receipt).toMatchObject({ quantityAdded: 2, unit: 'bottle', merged: false });
  });

  it('maps servings to an existing same-name item unit and merges (FR-GC-004/005)', async () => {
    const existing = await InventoryItem.create({
      userId: USER_A,
      name: 'Milk',
      quantity: 1,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
    });

    const receipt = await applyPurchase(USER_A, line({ quantity: 3, unit: 'servings' }));

    const item = await InventoryItem.findById(existing._id);
    expect(item?.quantity).toBe(4);
    expect(receipt).toMatchObject({
      inventoryItemId: String(existing._id),
      quantityAdded: 3,
      unit: 'L',
      merged: true,
    });
    expect(await InventoryItem.countDocuments({ userId: USER_A, name: 'Milk' })).toBe(1);
  });

  it('uses a learned alias unit for servings lines when no same-name stock exists (FR-GC-004)', async () => {
    await IngredientAlias.create({
      userId: USER_A,
      nameKey: 'tortillas',
      unit: 'pack',
      expiryObservations: [],
    });

    const receipt = await applyPurchase(
      USER_A,
      line({
        ingredientName: 'tortillas',
        displayName: 'Tortillas',
        quantity: 2,
        unit: 'servings',
        category: 'Grains',
      }),
    );

    const item = await InventoryItem.findById(receipt.inventoryItemId);
    expect(item?.name).toBe('Tortillas');
    expect(item?.quantity).toBe(2);
    expect(item?.unit).toBe('pack');
    expect(item?.location).toBe('pantry');
    expect(receipt.merged).toBe(false);
  });

  it('does not merge into expired same-name stock (FR-GC-005)', async () => {
    await InventoryItem.create({
      userId: USER_A,
      name: 'Milk',
      quantity: 1,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const receipt = await applyPurchase(USER_A, line({ quantity: 2, unit: 'L' }));

    expect(receipt.merged).toBe(false);
    expect(await InventoryItem.countDocuments({ userId: USER_A, name: 'Milk' })).toBe(2);
  });

  it('does not merge incompatible same-name units (FR-GC-005)', async () => {
    await InventoryItem.create({
      userId: USER_A,
      name: 'Stock',
      quantity: 1,
      unit: 'L',
      category: 'Pantry',
      location: 'pantry',
    });

    const receipt = await applyPurchase(
      USER_A,
      line({ ingredientName: 'stock', displayName: 'Stock', quantity: 500, unit: 'g', category: 'Pantry' }),
    );

    expect(receipt.merged).toBe(false);
    expect(await InventoryItem.countDocuments({ userId: USER_A, name: 'Stock' })).toBe(2);
  });

  it('never merges or updates another user inventory item (FR-GC-013)', async () => {
    const other = await InventoryItem.create({
      userId: USER_B,
      name: 'Milk',
      quantity: 1,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
    });

    const receipt = await applyPurchase(USER_A, line({ quantity: 2, unit: 'L' }));

    const otherAfter = await InventoryItem.findById(other._id);
    expect(otherAfter?.quantity).toBe(1);
    expect(receipt.merged).toBe(false);
    expect(await InventoryItem.countDocuments({ userId: USER_A, name: 'Milk' })).toBe(1);
  });
});

describe('reversePurchase (spec 007 FR-GC-007/008/013)', () => {
  it('deletes a created item when reversing its receipt (FR-GC-007)', async () => {
    const receipt = await applyPurchase(USER_A, line({ displayName: 'Olive Oil', unit: 'bottle', category: 'Pantry' }));

    await reversePurchase(USER_A, receipt);

    expect(await InventoryItem.findById(receipt.inventoryItemId)).toBeNull();
  });

  it('decrements a merged item by the receipted amount (FR-GC-007)', async () => {
    const existing = await InventoryItem.create({
      userId: USER_A,
      name: 'Milk',
      quantity: 5,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
    });
    const receipt = await applyPurchase(USER_A, line({ quantity: 2, unit: 'L' }));

    await reversePurchase(USER_A, receipt);

    const item = await InventoryItem.findById(existing._id);
    expect(item?.quantity).toBe(5);
  });

  it('clamps reversal to live stock and never goes negative (FR-GC-007/008)', async () => {
    const receipt = await applyPurchase(USER_A, line({ quantity: 5, unit: 'L' }));
    await InventoryItem.findByIdAndUpdate(receipt.inventoryItemId, { $set: { quantity: 2 } });

    await reversePurchase(USER_A, receipt);

    expect(await InventoryItem.findById(receipt.inventoryItemId)).toBeNull();
  });

  it('does nothing when the target item was deleted externally (FR-GC-008)', async () => {
    const receipt = await applyPurchase(USER_A, line({ quantity: 2, unit: 'L' }));
    await InventoryItem.findByIdAndDelete(receipt.inventoryItemId);

    await expect(reversePurchase(USER_A, receipt)).resolves.toBeUndefined();
  });

  it('never reverses another user inventory item (FR-GC-013)', async () => {
    const other = await InventoryItem.create({
      userId: USER_B,
      name: 'Milk',
      quantity: 2,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
    });

    await reversePurchase(USER_A, {
      inventoryItemId: String(other._id),
      quantityAdded: 2,
      unit: 'L',
      merged: false,
    });

    const otherAfter = await InventoryItem.findById(other._id);
    expect(otherAfter?.quantity).toBe(2);
  });
});
