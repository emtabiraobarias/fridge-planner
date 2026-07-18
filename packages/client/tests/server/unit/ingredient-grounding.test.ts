// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { MealRecommendation } from '@server/types/meal-recommendation';

const USER = 'ground-user-a';
const OTHER = 'ground-user-b';

let mongod: MongoMemoryServer;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let IngredientAlias: typeof import('@server/models/ingredient-alias').IngredientAlias;
let groundMeals: typeof import('@server/lib/ingredient-grounding').groundMeals;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ IngredientAlias } = await import('@server/models/ingredient-alias'));
  ({ groundMeals } = await import('@server/lib/ingredient-grounding'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  delete process.env['OPENAI_API_KEY'];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function seed(
  name: string,
  quantity: number,
  unit: string,
  userId = USER,
): Promise<string> {
  const item = await InventoryItem.create({
    userId,
    name,
    quantity,
    unit,
    category: 'Meat',
    location: 'fridge',
  });
  return String(item._id);
}

/** A raw agent meal whose usesIngredients is whatever shape the (untrusted) agent sent. */
function rawMeal(usesIngredients: unknown): MealRecommendation {
  return {
    mealName: 'Test Meal',
    suggestedMealType: 'dinner',
    prepTimeMinutes: 20,
    cuisine: 'Test',
    description: 'test',
    usesIngredients: usesIngredients as string[],
    expiringIngredients: [],
    missingIngredients: ['soy sauce'],
  };
}

async function inventoryOf(userId = USER): Promise<import('@server/models/inventory-item').InventoryItemDocument[]> {
  return (await InventoryItem.find({ userId })) as never;
}

describe('groundMeals — tiered resolution (FR-MC-001..004)', () => {
  it('resolves a direct inventory item id with a clamped amount (tier 1, FR-MC-001)', async () => {
    const id = await seed('Chicken Thighs', 1, 'kg');
    const [meal] = await groundMeals(
      USER,
      [rawMeal([{ inventoryItemId: id, name: 'chicken thighs', quantityToConsume: 0.5, unit: 'kg' }])],
      await inventoryOf(),
    );
    expect(meal!.groundedIngredients).toHaveLength(1);
    const g = meal!.groundedIngredients![0]!;
    expect(g.inventoryItemId).toBe(id);
    expect(g.resolution).toBe('direct');
    expect(g.quantityToConsume).toBe(0.5);
    expect(g.unit).toBe('kg');
    expect(meal!.usesIngredients).toContain('chicken thighs');
  });

  it("rejects another user's item id and re-resolves by name (FR-036 / FR-MC-002)", async () => {
    const foreignId = await seed('Chicken', 5, 'kg', OTHER);
    await seed('Chicken', 2, 'kg');
    const [meal] = await groundMeals(
      USER,
      [rawMeal([{ inventoryItemId: foreignId, name: 'chicken', quantityToConsume: 1, unit: 'kg' }])],
      await inventoryOf(),
    );
    const g = meal!.groundedIngredients![0]!;
    expect(g.inventoryItemId).not.toBe(foreignId);
    expect(g.resolution).toBe('fuzzy');
  });

  it('falls to name matching when the id does not exist (tier 2)', async () => {
    await seed('Chicken', 2, 'kg');
    const [meal] = await groundMeals(
      USER,
      [rawMeal([{ inventoryItemId: '000000000000000000000000', name: 'chicken', quantityToConsume: 1, unit: 'kg' }])],
      await inventoryOf(),
    );
    expect(meal!.groundedIngredients![0]!.resolution).toBe('fuzzy');
  });

  it('fuzzy-matches "chicken breast" to the owned "Chicken" (FR-MC-003, spec US1-S2)', async () => {
    const id = await seed('Chicken', 2, 'kg');
    const [meal] = await groundMeals(
      USER,
      [rawMeal([{ name: 'chicken breast', quantityToConsume: 0.5, unit: 'kg' }])],
      await inventoryOf(),
    );
    const g = meal!.groundedIngredients![0]!;
    expect(g.inventoryItemId).toBe(id);
    expect(g.resolution).toBe('fuzzy');
  });

  it('uses a stored alias pairing without any LLM call (tier 3, FR-MC-004)', async () => {
    const id = await seed('Beef Mince', 500, 'g');
    await IngredientAlias.create({ userId: USER, nameKey: 'mince', inventoryName: 'Beef Mince' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const [meal] = await groundMeals(
      USER,
      [rawMeal([{ name: 'mince', quantityToConsume: 200, unit: 'g' }])],
      await inventoryOf(),
    );
    const g = meal!.groundedIngredients![0]!;
    expect(g.inventoryItemId).toBe(id);
    expect(g.resolution).toBe('alias');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('consults the LLM once on an alias miss, persists the pairing, and reuses it (FR-MC-004)', async () => {
    process.env['OPENAI_API_KEY'] = 'test-key';
    const id = await seed('Beef Mince', 500, 'g');
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"match":"Beef Mince"}' } }] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const ingredientName = `ground-mince-${Date.now()}`; // unique key: module-level cache survives tests
    const [meal] = await groundMeals(
      USER,
      [rawMeal([{ name: ingredientName, quantityToConsume: 200, unit: 'g' }])],
      await inventoryOf(),
    );
    expect(meal!.groundedIngredients![0]!.inventoryItemId).toBe(id);
    expect(meal!.groundedIngredients![0]!.resolution).toBe('alias');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Pairing persisted per-pair (bounded cost)…
    const alias = await IngredientAlias.findOne({ userId: USER });
    expect(alias?.inventoryName).toBe('Beef Mince');

    // …and a repeat lookup does not re-consult the LLM.
    await groundMeals(
      USER,
      [rawMeal([{ name: ingredientName, quantityToConsume: 100, unit: 'g' }])],
      await inventoryOf(),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('fails open to unresolved when the LLM is unavailable (FR-MC-004)', async () => {
    process.env['OPENAI_API_KEY'] = 'test-key';
    await seed('Beef Mince', 500, 'g');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const [meal] = await groundMeals(
      USER,
      [rawMeal([{ name: `ground-fail-${Date.now()}`, quantityToConsume: 200, unit: 'g' }])],
      await inventoryOf(),
    );
    expect(meal!.groundedIngredients![0]!.resolution).toBe('unresolved');
  });

  it('keeps unresolved ingredients visible as missing — never drops the meal (FR-MC-003)', async () => {
    await seed('Chicken', 2, 'kg');
    const [meal] = await groundMeals(
      USER,
      [rawMeal([{ name: 'dragon fruit', quantityToConsume: 1, unit: 'count' }])],
      await inventoryOf(),
    );
    expect(meal).toBeDefined();
    expect(meal!.groundedIngredients![0]!.resolution).toBe('unresolved');
    expect(meal!.missingIngredients).toContain('dragon fruit');
    expect(meal!.usesIngredients).not.toContain('dragon fruit');
  });
});

describe('groundMeals — amount validation & clamping (FR-MC-002)', () => {
  it('clamps an over-ask to the owned quantity across compatible units', async () => {
    await seed('Chicken', 1000, 'g');
    const [meal] = await groundMeals(
      USER,
      [rawMeal([{ name: 'chicken', quantityToConsume: 5, unit: 'kg' }])],
      await inventoryOf(),
    );
    const g = meal!.groundedIngredients![0]!;
    expect(g.quantityToConsume).toBe(1);
    expect(g.unit).toBe('kg');
  });

  it('drops non-positive and absurd amounts (matched but unquantified)', async () => {
    await seed('Chicken', 1000, 'g');
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, 10_000_000]) {
      const [meal] = await groundMeals(
        USER,
        [rawMeal([{ name: 'chicken', quantityToConsume: bad, unit: 'g' }])],
        await inventoryOf(),
      );
      const g = meal!.groundedIngredients![0]!;
      expect(g.resolution).not.toBe('unresolved');
      expect(g.quantityToConsume).toBeUndefined();
    }
  });

  it('keeps the item match but drops the amount when units are incompatible', async () => {
    await seed('Chicken', 1000, 'g');
    const [meal] = await groundMeals(
      USER,
      [rawMeal([{ name: 'chicken', quantityToConsume: 2, unit: 'L' }])],
      await inventoryOf(),
    );
    const g = meal!.groundedIngredients![0]!;
    expect(g.inventoryItemId).toBeDefined();
    expect(g.quantityToConsume).toBeUndefined();
  });

  it('assumes the item unit when the agent omits it, still clamped', async () => {
    await seed('Eggs', 6, 'count');
    const [meal] = await groundMeals(
      USER,
      [rawMeal([{ name: 'eggs', quantityToConsume: 10 }])],
      await inventoryOf(),
    );
    const g = meal!.groundedIngredients![0]!;
    expect(g.quantityToConsume).toBe(6);
    expect(g.unit).toBe('count');
  });
});

describe('groundMeals — hostile/malformed payloads (FR-MC-002)', () => {
  it('tolerates legacy string usesIngredients (pre-006 agent) end-to-end', async () => {
    const id = await seed('Chicken', 2, 'kg');
    const [meal] = await groundMeals(USER, [rawMeal(['chicken'])], await inventoryOf());
    const g = meal!.groundedIngredients![0]!;
    expect(g.inventoryItemId).toBe(id);
    expect(g.quantityToConsume).toBeUndefined();
  });

  it('skips garbage entries field-wise without failing the meal', async () => {
    await seed('Chicken', 2, 'kg');
    const [meal] = await groundMeals(
      USER,
      [
        rawMeal([
          { name: 123, quantityToConsume: 'lots' },
          null,
          { inventoryItemId: { $gt: '' }, name: 'chicken' },
          'chicken',
        ]),
      ],
      await inventoryOf(),
    );
    expect(meal).toBeDefined();
    // the two salvageable entries: the injection-shaped id is discarded but its name resolves
    const resolved = meal!.groundedIngredients!.filter((g) => g.resolution !== 'unresolved');
    expect(resolved.length).toBeGreaterThanOrEqual(1);
    for (const g of meal!.groundedIngredients!) {
      expect(typeof g.name).toBe('string');
    }
  });

  it('caps the grounded list at 20 entries', async () => {
    await seed('Chicken', 2, 'kg');
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `thing ${i}` }));
    const [meal] = await groundMeals(USER, [rawMeal(many)], await inventoryOf());
    expect(meal!.groundedIngredients!.length).toBeLessThanOrEqual(20);
  });
});
