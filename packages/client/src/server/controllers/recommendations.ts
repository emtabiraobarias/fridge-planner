import 'server-only';
import { InventoryItem } from '../models/inventory-item';
import { getMealRecommendations } from '../services/meal-recommender';
import { attachVerifiedRecipes, isRecipeVerificationConfigured } from '../services/recipe-verifier';
import { buildCacheKey, getCached, getStale, setCached } from '../services/recommendations-cache';
import { notExpiredQuery } from '../lib/expiration';
import { POPULAR_RECIPES } from '../lib/popular-recipes';
import type { MealRecommendation } from '../types/meal-recommendation';
import type { ControllerResult } from '../http';
import { problem } from '../http';

// FR-037: only meals with a verified recipe link may be shown; below this count after
// verification, one top-up round asks the agent for more candidates.
const MIN_LINKED_MEALS = 3;
const MAX_MEALS = 5;

function withLinks(meals: MealRecommendation[]): MealRecommendation[] {
  return meals.filter((m) => Boolean(m.recipeUrl));
}

/**
 * FR-037 top-up round: one extra agent call (excluding every already-seen meal name),
 * verified like the first. Best-effort — on any failure the first-round linked meals
 * stand unchanged.
 */
async function topUpLinkedMeals(
  ingredients: Parameters<typeof getMealRecommendations>[0],
  seenNames: string[],
  linked: MealRecommendation[],
): Promise<MealRecommendation[]> {
  try {
    const extra = await getMealRecommendations(ingredients, seenNames);
    const fresh = extra.filter((m) => !seenNames.includes(m.mealName));
    const extraLinked = withLinks(await attachVerifiedRecipes(fresh));
    return [...linked, ...extraLinked].slice(0, MAX_MEALS);
  } catch (err) {
    console.warn('recommendations: top-up round failed', err);
    return linked;
  }
}

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

  // Option A groundedness: the LLM never authors a recipeUrl — attach one here only if a
  // real, existing recipe was found (approved domains, then Spoonacular). Runs before
  // caching so the verified URLs are cached too, avoiding repeat lookups within the TTL.
  //
  // FR-037: meals without a verified link are dropped. If that leaves fewer than
  // MIN_LINKED_MEALS, one top-up round asks the agent for different meals (excluding
  // every name already seen) and verifies those too.
  const firstRound = await attachVerifiedRecipes(recommendations);
  let linked = withLinks(firstRound);

  if (linked.length < MIN_LINKED_MEALS && isRecipeVerificationConfigured()) {
    const seenNames = recommendations.map((m) => m.mealName);
    linked = await topUpLinkedMeals(ingredients, seenNames, linked);
  }

  if (linked.length === 0) {
    // FR-037: never show unlinked meals. Zero linked meals means verification is either
    // unconfigured or failing — fail loudly rather than silently degrade.
    const detail = isRecipeVerificationConfigured()
      ? 'No recipe link could be verified for any recommended meal. The verification providers may be unavailable — try again shortly.'
      : 'Recipe-link verification is not configured (BRAVE_SEARCH_API_KEY / SPOONACULAR_API_KEY unset), so no recommendation can carry the required recipe link.';
    return problem(503, 'Recipe verification unavailable', detail);
  }

  setCached(cacheKey, linked);
  return { status: 200, body: { recommendations: linked } };
}
