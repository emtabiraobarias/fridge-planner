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
// FR-037: the controller needs ≥3 linked meals to skip the top-up round, so the
// default agent response is a trio.
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

// Mock the recipe-verifier enrichment step (its own internals are unit-tested
// separately in unit/recipe-verifier.test.ts). Defaults to linking every meal
// (FR-037: unlinked meals are dropped); overridden per-test where the scenario
// needs unlinked or partially-linked results.
const { attachVerifiedRecipes, isRecipeVerificationConfigured } = vi.hoisted(() => ({
  attachVerifiedRecipes: vi.fn(),
  isRecipeVerificationConfigured: vi.fn(),
}));
vi.mock('@server/services/recipe-verifier', () => ({
  attachVerifiedRecipes,
  isRecipeVerificationConfigured,
}));

function linkAll(meals: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  return Promise.resolve(
    meals.map((m) => ({
      ...m,
      recipeUrl: `https://www.recipetineats.com/${String(m['mealName']).toLowerCase().replace(/\s+/g, '-')}/`,
    })),
  );
}

let mongod: MongoMemoryServer;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let invalidateUser: typeof import('@server/services/recommendations-cache').invalidateUser;
let POST: typeof import('../../app/api/v1/recommendations/route').POST;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ invalidateUser } = await import('@server/services/recommendations-cache'));
  ({ POST } = await import('../../app/api/v1/recommendations/route'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  getMealRecommendations.mockReset();
  attachVerifiedRecipes.mockReset();
  attachVerifiedRecipes.mockImplementation(linkAll);
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

async function seedInv(name: string, quantity = 2): Promise<void> {
  await InventoryItem.create({ userId: USER, name, quantity, unit: 'lbs', category: 'Meat', location: 'fridge' });
}

interface RecResponse {
  recommendations: Array<{ mealName: string }>;
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

  it('calls the agent with non-expired inventory and returns its meals', async () => {
    await seedInv('Chicken Breast');
    getMealRecommendations.mockResolvedValueOnce(mockMeals);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as RecResponse;
    expect(body.recommendations[0]?.mealName).toBe('Chicken Stir-fry');
    expect(body.fallback).toBeUndefined();
    expect(getMealRecommendations).toHaveBeenCalledTimes(1);
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
    expect(body.fallback).toBeUndefined();
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

  it('enriches agent meals with a verified recipeUrl before caching (Option A groundedness)', async () => {
    await seedInv('Chicken Breast');
    getMealRecommendations.mockResolvedValueOnce(mockMeals);

    const res = await POST(req());
    const body = (await res.json()) as { recommendations: Array<{ mealName: string; recipeUrl?: string }> };
    expect(attachVerifiedRecipes).toHaveBeenCalledWith(mockMeals);
    expect(body.recommendations[0]?.recipeUrl).toBe('https://www.recipetineats.com/chicken-stir-fry/');

    // The enriched (URL-attached) result is what gets cached, not the raw agent output.
    const res2 = await POST(req());
    const body2 = (await res2.json()) as { recommendations: Array<{ recipeUrl?: string }> };
    expect(body2.recommendations[0]?.recipeUrl).toBe('https://www.recipetineats.com/chicken-stir-fry/');
    expect(getMealRecommendations).toHaveBeenCalledTimes(1);
  });

  it('drops meals without a verified recipe link and tops up once, excluding seen names (FR-037)', async () => {
    await seedInv('Chicken Breast');
    // Round 1: three meals, only one gets a link.
    getMealRecommendations.mockResolvedValueOnce(mockMeals);
    attachVerifiedRecipes.mockImplementationOnce((meals: Array<Record<string, unknown>>) =>
      Promise.resolve(
        meals.map((m, i) => (i === 0 ? { ...m, recipeUrl: 'https://www.recipetineats.com/stir-fry/' } : m)),
      ),
    );
    // Round 2 (top-up): two fresh meals, both linked by the default linkAll mock.
    const topUpMeals = [
      { ...mockMeal, mealName: 'Chicken Adobo' },
      { ...mockMeal, mealName: 'Chicken Congee' },
    ];
    getMealRecommendations.mockResolvedValueOnce(topUpMeals);

    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recommendations: Array<{ mealName: string; recipeUrl?: string }> };

    // Unlinked round-1 meals are gone; every returned meal has a link.
    expect(body.recommendations.map((m) => m.mealName)).toEqual([
      'Chicken Stir-fry',
      'Chicken Adobo',
      'Chicken Congee',
    ]);
    expect(body.recommendations.every((m) => Boolean(m.recipeUrl))).toBe(true);

    // The top-up call excluded every already-seen meal name.
    expect(getMealRecommendations).toHaveBeenCalledTimes(2);
    const excludeArg = getMealRecommendations.mock.calls[1]?.[1] as string[];
    expect(excludeArg).toEqual(mockMeals.map((m) => m.mealName));
  });

  it('returns 503 Problem JSON when no meal can be linked and verification is configured (FR-037)', async () => {
    await seedInv('Chicken Breast');
    getMealRecommendations.mockResolvedValue(mockMeals);
    attachVerifiedRecipes.mockImplementation((meals: unknown) => Promise.resolve(meals)); // links nothing

    const res = await POST(req());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { title: string; detail: string };
    expect(body.title).toBe('Recipe verification unavailable');
    expect(body.detail).toMatch(/providers may be unavailable/i);
    // One top-up round was still attempted before failing.
    expect(getMealRecommendations).toHaveBeenCalledTimes(2);
  });

  it('returns 503 without a top-up round when verification is not configured (FR-037)', async () => {
    await seedInv('Chicken Breast');
    getMealRecommendations.mockResolvedValue(mockMeals);
    attachVerifiedRecipes.mockImplementation((meals: unknown) => Promise.resolve(meals)); // links nothing
    isRecipeVerificationConfigured.mockReturnValue(false);

    const res = await POST(req());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { detail: string };
    expect(body.detail).toMatch(/not configured/i);
    // No point topping up when verification can never link anything.
    expect(getMealRecommendations).toHaveBeenCalledTimes(1);
  });

  it('popular-recipe fallbacks all carry a verified recipe link (FR-037)', async () => {
    const res = await POST(req());
    const body = (await res.json()) as { recommendations: Array<{ recipeUrl?: string }>; fallback: string };
    expect(body.fallback).toBe('popular');
    expect(body.recommendations.length).toBeGreaterThan(0);
    expect(body.recommendations.every((m) => Boolean(m.recipeUrl))).toBe(true);
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
