// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const USER = 'user-a';

const mockMeal = {
  mealName: 'Chicken Stir-fry',
  suggestedMealType: 'dinner' as const,
  prepTimeMinutes: 20,
  cuisine: 'Asian',
  description: 'Quick stir-fry using chicken before it expires.',
  usesIngredients: ['chicken breast'],
  expiringIngredients: ['chicken breast'],
  missingIngredients: [],
};
const mockMeals = [
  mockMeal,
  { ...mockMeal, mealName: 'Chicken Rice Bowl' },
  { ...mockMeal, mealName: 'Garlic Chicken Noodles' },
];

// Mock the Holodeck agent call (no real network). vi.hoisted lets the factory
// reference the spy. Both the controller's relative import and this @server path
// resolve to the same module, so the mock applies.
const { getMealRecommendations } = vi.hoisted(() => ({ getMealRecommendations: vi.fn() }));
vi.mock('@server/services/meal-recommender', () => ({ getMealRecommendations }));

// Mock the recipe-verifier (its internals are unit-tested in unit/recipe-verifier.test.ts).
// FR-037 async revision: the results endpoint never touches the verifier; only the
// verify-links endpoint does, via verifyRecipeCached + isRecipeVerificationConfigured.
const { verifyRecipeCached, isRecipeVerificationConfigured } = vi.hoisted(() => ({
  verifyRecipeCached: vi.fn(),
  isRecipeVerificationConfigured: vi.fn(),
}));
vi.mock('@server/services/recipe-verifier', () => ({
  verifyRecipeCached,
  isRecipeVerificationConfigured,
}));

let mongod: MongoMemoryServer;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let invalidateUser: typeof import('@server/services/recommendations-cache').invalidateUser;
let getRecommendations: typeof import('@server/controllers/recommendations').getRecommendations;
let POST: typeof import('../../app/api/v1/recommendations/route').POST;
let POST_LINKS: typeof import('../../app/api/v1/recommendations/verify-links/route').POST;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ invalidateUser } = await import('@server/services/recommendations-cache'));
  ({ getRecommendations } = await import('@server/controllers/recommendations'));
  ({ POST } = await import('../../app/api/v1/recommendations/route'));
  ({ POST: POST_LINKS } = await import('../../app/api/v1/recommendations/verify-links/route'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  getMealRecommendations.mockReset();
  verifyRecipeCached.mockReset();
  isRecipeVerificationConfigured.mockReset();
  isRecipeVerificationConfigured.mockReturnValue(true);
  invalidateUser(USER);
  // Reset the in-memory rate-limit windows so per-test call counts start fresh.
  (globalThis as unknown as { _rateLimitBuckets?: Map<string, unknown> })._rateLimitBuckets?.clear();
});

function req(userId = USER): Request {
  return new Request('http://localhost/api/v1/recommendations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
  });
}

function reqBody(body: unknown, userId = USER): Request {
  return new Request('http://localhost/api/v1/recommendations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify(body),
  });
}

function linksReq(body: unknown, userId = USER): Request {
  return new Request('http://localhost/api/v1/recommendations/verify-links', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify(body),
  });
}

async function seedInv(name: string, quantity = 2): Promise<void> {
  await InventoryItem.create({ userId: USER, name, quantity, unit: 'lbs', category: 'Meat', location: 'fridge' });
}

interface RecResponse {
  recommendations: Array<{ mealName: string; recipeUrl?: string }>;
  fallback?: string;
}

describe('POST /api/v1/recommendations', () => {
  it('returns popular recipes without calling the agent when inventory is empty (EC-01)', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as RecResponse;
    expect(body.fallback).toBe('popular');
    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(getMealRecommendations).not.toHaveBeenCalled();
  });

  it('popular-recipe fallbacks all carry a pre-verified recipe link (FR-037)', async () => {
    const res = await POST(req());
    const body = (await res.json()) as RecResponse;
    expect(body.fallback).toBe('popular');
    expect(body.recommendations.every((m) => Boolean(m.recipeUrl))).toBe(true);
  });

  it('returns agent meals immediately without touching the verifier (FR-037 async)', async () => {
    await seedInv('Chicken Breast');
    getMealRecommendations.mockResolvedValueOnce(mockMeals);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as RecResponse;
    expect(body.recommendations.map((m) => m.mealName)).toEqual(mockMeals.map((m) => m.mealName));
    expect(body.fallback).toBeUndefined();
    expect(getMealRecommendations).toHaveBeenCalledTimes(1);
    // No blocking verification on the results path.
    expect(verifyRecipeCached).not.toHaveBeenCalled();
  });

  it('excludes expired items from the agent input (FR-007)', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await seedInv('Chicken Breast');
    await InventoryItem.create({
      userId: USER, name: 'Old Milk', quantity: 1, unit: 'l', category: 'Dairy', location: 'fridge', expiresAt: yesterday,
    });
    getMealRecommendations.mockResolvedValue(mockMeals);
    await POST(req());
    const arg = getMealRecommendations.mock.calls[0]?.[0] as Array<{ name: string }>;
    const names = arg.map((i) => i.name);
    expect(names).toContain('Chicken Breast');
    expect(names).not.toContain('Old Milk');
  });

  it('serves a cached result on the second identical call (agent called once)', async () => {
    await seedInv('Chicken Breast');
    getMealRecommendations.mockResolvedValue(mockMeals);
    await POST(req());
    const res2 = await POST(req());
    const body = (await res2.json()) as RecResponse;
    expect(body.recommendations[0]?.mealName).toBe('Chicken Stir-fry');
    expect(getMealRecommendations).toHaveBeenCalledTimes(1);
  });

  it('degrades to popular recipes when the agent fails and there is no cache (EC-08)', async () => {
    await seedInv('Chicken Breast');
    getMealRecommendations.mockRejectedValueOnce(new Error('agent down'));
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as RecResponse;
    expect(body.fallback).toBe('popular');
    expect(body.recommendations.length).toBeGreaterThan(0);
  });

  it('rate-limits to 10 requests/minute per user (429 on the 11th)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await POST(req('rate-test-user'));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('POST /api/v1/recommendations/verify-links (FR-037 lazy phase)', () => {
  it('returns a name→link map for verified meals and omits misses', async () => {
    verifyRecipeCached.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'Chicken Stir-fry'
          ? { recipeUrl: 'https://www.recipetineats.com/stir-fry/', imageUrl: 'https://img.example/x.jpg' }
          : null,
      ),
    );
    const res = await POST_LINKS(linksReq({ mealNames: ['Chicken Stir-fry', 'Obscure Dish'] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { links: Record<string, { recipeUrl: string }>; available: boolean };
    expect(body.available).toBe(true);
    expect(body.links['Chicken Stir-fry']?.recipeUrl).toBe('https://www.recipetineats.com/stir-fry/');
    expect(body.links['Obscure Dish']).toBeUndefined();
  });

  it('reports available:false without calling the verifier when no provider key is set', async () => {
    isRecipeVerificationConfigured.mockReturnValue(false);
    const res = await POST_LINKS(linksReq({ mealNames: ['Chicken Stir-fry'] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { links: Record<string, unknown>; available: boolean };
    expect(body.available).toBe(false);
    expect(body.links).toEqual({});
    expect(verifyRecipeCached).not.toHaveBeenCalled();
  });

  it('rejects a malformed body with 400 Problem JSON', async () => {
    const res = await POST_LINKS(linksReq({ mealNames: [] }));
    expect(res.status).toBe(400);
    const res2 = await POST_LINKS(linksReq({ nope: true }));
    expect(res2.status).toBe(400);
  });

  it('caps the accepted list at 10 names (400 beyond)', async () => {
    const names = Array.from({ length: 11 }, (_, i) => `Meal ${i}`);
    const res = await POST_LINKS(linksReq({ mealNames: names }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/recommendations — grounding (spec 006, FR-MC-001..003)', () => {
  const groundedAgentMeal = (id: string): typeof mockMeal => ({
    ...mockMeal,
    // untrusted agent payload: new object shape for usesIngredients
    usesIngredients: [
      { inventoryItemId: id, name: 'chicken breast', quantityToConsume: 1, unit: 'lbs' },
    ] as unknown as string[],
  });

  it('returns validated groundedIngredients + derived legacy usesIngredients (FR-MC-001)', async () => {
    await seedInv('chicken breast');
    const item = await InventoryItem.findOne({ userId: USER });
    getMealRecommendations.mockResolvedValue([groundedAgentMeal(String(item!._id))]);

    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      recommendations: Array<{
        usesIngredients: string[];
        groundedIngredients?: Array<{ inventoryItemId?: string; resolution: string; quantityToConsume?: number }>;
      }>;
    };
    const meal = body.recommendations[0]!;
    expect(meal.groundedIngredients).toHaveLength(1);
    expect(meal.groundedIngredients![0]!.inventoryItemId).toBe(String(item!._id));
    expect(meal.groundedIngredients![0]!.resolution).toBe('direct');
    expect(meal.usesIngredients).toEqual(['chicken breast']);
  });

  it("scrubs a foreign user's inventory id end-to-end (FR-036 / FR-MC-002)", async () => {
    await seedInv('chicken breast');
    const foreign = await InventoryItem.create({
      userId: 'someone-else',
      name: 'chicken breast',
      quantity: 9,
      unit: 'lbs',
      category: 'Meat',
      location: 'fridge',
    });
    getMealRecommendations.mockResolvedValue([groundedAgentMeal(String(foreign._id))]);

    const res = await POST(req());
    const body = (await res.json()) as {
      recommendations: Array<{ groundedIngredients?: Array<{ inventoryItemId?: string }> }>;
    };
    const g = body.recommendations[0]!.groundedIngredients![0]!;
    expect(g.inventoryItemId).not.toBe(String(foreign._id));
  });

  it('popular-recipes fallback passes through ungrounded (EC-01 unchanged)', async () => {
    const res = await POST(req());
    const body = (await res.json()) as {
      fallback?: string;
      recommendations: Array<{ groundedIngredients?: unknown }>;
    };
    expect(body.fallback).toBe('popular');
    expect(body.recommendations[0]!.groundedIngredients).toBeUndefined();
  });

  it('caches grounded meals — the second request re-serves groundedIngredients without the agent (research D4)', async () => {
    await seedInv('chicken breast');
    const item = await InventoryItem.findOne({ userId: USER });
    getMealRecommendations.mockResolvedValue([groundedAgentMeal(String(item!._id))]);

    await POST(req());
    const res2 = await POST(req());
    expect(getMealRecommendations).toHaveBeenCalledTimes(1);
    const body = (await res2.json()) as {
      recommendations: Array<{ groundedIngredients?: Array<{ resolution: string }> }>;
    };
    expect(body.recommendations[0]!.groundedIngredients).toHaveLength(1);
  });
});

describe('getRecommendations — ingredient scoping (spec 009 US2, FR-IR-005/008/009/010/011)', () => {
  const days = (n: number): Date => new Date(Date.now() + n * 86_400_000);

  async function seedExpiring(name: string, expiresAt?: Date): Promise<string> {
    const doc = await InventoryItem.create({
      userId: USER,
      name,
      quantity: 2,
      unit: 'lbs',
      category: 'Meat',
      location: 'fridge',
      ...(expiresAt ? { expiresAt } : {}),
    });
    return String(doc._id);
  }

  it('sends the agent ONLY the selected subset, in expiry order, and grounds only those (FR-IR-005/008/009)', async () => {
    // Insert idB (later-expiring) FIRST and idA (sooner-expiring) SECOND so a pass
    // proves expiry ordering, not accidental insertion order (analyze M1 / FR-IR-009).
    const idB = await seedExpiring('Broccoli', days(8));
    const idA = await seedExpiring('Chicken Breast', days(2));
    const idC = await seedExpiring('Rice'); // not selected — must never reach the agent
    getMealRecommendations.mockResolvedValue([
      // grounded ref to the UNSELECTED item idC — must NOT resolve 'direct' since
      // groundMeals only sees the scoped subset.
      {
        ...mockMeal,
        usesIngredients: [
          { inventoryItemId: idC, name: 'rice', quantityToConsume: 1, unit: 'cups' },
        ] as unknown as string[],
      },
    ]);

    const result = await getRecommendations(USER, [idA, idB]);
    expect(result.status).toBe(200);

    const arg = getMealRecommendations.mock.calls[0]?.[0] as Array<{ id: string; name: string }>;
    // Only the two selected items — Rice (idC) is excluded (FR-IR-005).
    expect(arg.map((i) => i.name)).toEqual(['Chicken Breast', 'Broccoli']);
    // Sooner-expiring idA precedes later idB in the payload (FR-IR-009).
    expect(arg.map((i) => i.id)).toEqual([idA, idB]);

    // groundMeals ran over the subset only: the unselected idC ref cannot resolve 'direct'.
    const body = result.body as {
      recommendations: Array<{ groundedIngredients?: Array<{ inventoryItemId?: string; resolution: string }> }>;
    };
    const g = body.recommendations[0]?.groundedIngredients?.[0];
    if (g) expect(g.resolution).not.toBe('direct');
  });

  it('is a cache hit on an identical selection — the agent is called once (FR-IR-011/SC-IR-005)', async () => {
    const idA = await seedExpiring('Chicken Breast', days(2));
    const idB = await seedExpiring('Broccoli', days(8));
    getMealRecommendations.mockResolvedValue(mockMeals);

    await getRecommendations(USER, [idA, idB]);
    await getRecommendations(USER, [idA, idB]);
    expect(getMealRecommendations).toHaveBeenCalledTimes(1);
  });

  it('falls back to the whole non-expired set when the selection intersects to nothing (FR-IR-010)', async () => {
    const yesterday = days(-1);
    await seedExpiring('Fresh Chicken', days(3));
    const expiredId = await seedExpiring('Old Milk', yesterday); // excluded by notExpiredQuery
    getMealRecommendations.mockResolvedValue(mockMeals);

    // All-expired / all-absent selection → whole inventory, never an empty agent call.
    await getRecommendations(USER, [expiredId, 'nonexistent-id']);
    const arg = getMealRecommendations.mock.calls[0]?.[0] as Array<{ name: string }>;
    expect(arg.map((i) => i.name)).toEqual(['Fresh Chicken']);
    expect(arg.length).toBeGreaterThan(0);
  });

  it('an empty ids array is a whole-inventory request (FR-IR-004/010)', async () => {
    await seedExpiring('Fresh Chicken', days(3));
    getMealRecommendations.mockResolvedValue(mockMeals);
    await getRecommendations(USER, []);
    const arg = getMealRecommendations.mock.calls[0]?.[0] as Array<{ name: string }>;
    expect(arg.map((i) => i.name)).toEqual(['Fresh Chicken']);
  });

  it('POST route parses ingredientItemIds and reaches the scoped controller path end-to-end (T016)', async () => {
    const idB = await seedExpiring('Broccoli', days(8));
    const idA = await seedExpiring('Chicken Breast', days(2));
    await seedExpiring('Rice'); // unselected
    getMealRecommendations.mockResolvedValue(mockMeals);

    const res = await POST(reqBody({ ingredientItemIds: [idA, idB] }));
    expect(res.status).toBe(200);
    const arg = getMealRecommendations.mock.calls[0]?.[0] as Array<{ name: string }>;
    expect(arg.map((i) => i.name)).toEqual(['Chicken Breast', 'Broccoli']);
    expect(arg.map((i) => i.name)).not.toContain('Rice');
  });
});
