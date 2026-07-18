import 'server-only';
import { InventoryItem } from '../models/inventory-item';
import { getMealRecommendations } from '../services/meal-recommender';
import { verifyRecipeCached, isRecipeVerificationConfigured } from '../services/recipe-verifier';
import { buildCacheKey, getCached, getStale, setCached } from '../services/recommendations-cache';
import { notExpiredQuery } from '../lib/expiration';
import { groundMeals } from '../lib/ingredient-grounding';
import { POPULAR_RECIPES } from '../lib/popular-recipes';
import type { MealRecommendation } from '../types/meal-recommendation';
import type { VerifiedRecipe } from '../services/recipe-verifier';
import type { ControllerResult } from '../http';

// POST /api/v1/recommendations
//
// FR-037 (async revision): return the agent's meals IMMEDIATELY — recipe-link
// verification is not awaited here. The client follows up with
// POST /recommendations/verify-links (verifyRecipeLinks below), attaches links as
// they arrive, and removes any meal that ends up without one. The agent is asked
// for a 5-10 candidate net (FR-014) so enough meals survive that removal.
export async function getRecommendations(userId: string): Promise<ControllerResult> {
  // FR-036: scope to the authenticated user; FR-007: exclude expired items from LLM input.
  // Expiry is derived from expiresAt at query time (not the stale stored status — BUG #6).
  const activeItems = await InventoryItem.find({ userId, ...notExpiredQuery() });

  // EC-01: nothing to recommend from → popular recipes (pre-verified links — the
  // lazy verify phase is skipped for fallbacks).
  if (activeItems.length === 0) {
    return { status: 200, body: { recommendations: POPULAR_RECIPES, fallback: 'popular' } };
  }

  const ingredients = activeItems.map((item) => ({
    // Spec 006 FR-MC-001: the agent echoes these ids back as grounded references.
    id: String(item._id),
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

  // Spec 006 US1: validate the untrusted agent payload against live inventory and
  // ground it (tiered resolution + clamping) BEFORE caching, so cached meals are
  // grounded too (research D4). Fallback paths above pass through ungrounded.
  recommendations = await groundMeals(userId, recommendations, activeItems);

  setCached(cacheKey, recommendations);
  return { status: 200, body: { recommendations } };
}

// POST /api/v1/recommendations/verify-links — the FR-037 lazy phase.
//
// Verifies recipe links for the given meal names (Option A groundedness: only real,
// found pages — never fabricated). Per-name results are cached module-wide in the
// verifier, so repeat lookups within the TTL don't re-hit the search providers.
// `available: false` tells the client verification cannot run at all (no provider
// keys) so it can surface the FR-037 notice and remove unlinked meals.
export async function verifyRecipeLinks(mealNames: string[]): Promise<ControllerResult> {
  if (!isRecipeVerificationConfigured()) {
    return { status: 200, body: { links: {}, available: false } };
  }

  // SEQUENTIAL on purpose: Brave's free tier allows ~1 req/s, and a parallel burst
  // gets most lookups 429'd (observed live: 1/6 verified). Cache hits skip the
  // provider entirely, so repeat calls stay fast.
  const links: Record<string, VerifiedRecipe> = {};
  for (const name of mealNames) {
    const v = await verifyRecipeCached(name);
    if (v) links[name] = v;
  }
  return { status: 200, body: { links, available: true } };
}
