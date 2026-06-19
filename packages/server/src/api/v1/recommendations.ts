import { Router } from 'express';
import { InventoryItem } from '../../models/inventory-item.js';
import { getMealRecommendations } from '../../services/meal-recommender.js';
import { buildCacheKey, getCached, getStale, setCached } from '../../services/recommendations-cache.js';
import { notExpiredQuery } from '../../lib/expiration.js';
import { POPULAR_RECIPES } from '../../lib/popular-recipes.js';
import type { MealRecommendation } from '../../types/meal-recommendation.js';

export const recommendationsRouter = Router();

// POST /api/v1/recommendations
recommendationsRouter.post('/', async (req, res, next) => {
  try {
    // FR-036: scope to the authenticated user; FR-007: exclude expired items from LLM input.
    // Expiry is derived from expiresAt at query time (not the stale stored status — BUG #6).
    const activeItems = await InventoryItem.find({
      userId: req.userId,
      ...notExpiredQuery(),
    });

    // EC-01: nothing to recommend from → popular recipes (the "prompt to add items" lives client-side).
    if (activeItems.length === 0) {
      res.json({ recommendations: POPULAR_RECIPES, fallback: 'popular' });
      return;
    }

    const ingredients = activeItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      ...(item.expiresAt ? { expiresAt: item.expiresAt.toISOString() } : {}),
    }));

    const cacheKey = buildCacheKey(req.userId, ingredients);
    const cached = getCached(cacheKey);
    if (cached) {
      res.json({ recommendations: cached });
      return;
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
      res.json({
        recommendations: stale ?? POPULAR_RECIPES,
        fallback: stale ? 'cache' : 'popular',
      });
      return;
    }

    setCached(cacheKey, recommendations);
    res.json({ recommendations });
  } catch (err) {
    next(err);
  }
});
