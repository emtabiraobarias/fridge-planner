import 'server-only';
import { InventoryItem } from '../models/inventory-item';
import { getMealRecommendations } from '../services/meal-recommender';
import { buildCacheKey, getCached, getStale, setCached } from '../services/recommendations-cache';
import { notExpiredQuery } from '../lib/expiration';
import { POPULAR_RECIPES } from '../lib/popular-recipes';
import type { MealRecommendation } from '../types/meal-recommendation';
import type { ControllerResult } from '../http';

// POST /api/v1/recommendations
export async function getRecommendations(userId: string): Promise<ControllerResult> {
  // FR-036: scope to the authenticated user; FR-007: exclude expired items from LLM input.
  // Expiry is derived from expiresAt at query time (not the stale stored status — BUG #6).
  const activeItems = await InventoryItem.find({ userId, ...notExpiredQuery() });

  // EC-01: nothing to recommend from → popular recipes (the "prompt to add items" lives client-side).
  if (activeItems.length === 0) {
    return { status: 200, body: { recommendations: POPULAR_RECIPES, fallback: 'popular' } };
  }

  const ingredients = activeItems.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    ...(item.expiresAt ? { expiresAt: item.expiresAt.toISOString() } : {}),
  }));

  const cacheKey = buildCacheKey(userId, ingredients);
  const cached = getCached(cacheKey);
  if (cached) {
    return { status: 200, body: { recommendations: cached } };
  }

  // EC-08 / SC-010: if the agent is unavailable (down, timeout, malformed), degrade
  // gracefully — last-known-good cache if we have one, otherwise popular recipes — rather
  // than failing the request with a 500.
  let recommendations: MealRecommendation[];
  try {
    recommendations = await getMealRecommendations(ingredients);
  } catch (err) {
    console.warn('recommendations: agent unavailable, serving fallback', err);
    const stale = getStale(cacheKey);
    return {
      status: 200,
      body: { recommendations: stale ?? POPULAR_RECIPES, fallback: stale ? 'cache' : 'popular' },
    };
  }

  setCached(cacheKey, recommendations);
  return { status: 200, body: { recommendations } };
}
