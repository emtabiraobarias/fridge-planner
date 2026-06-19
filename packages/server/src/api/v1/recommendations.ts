import { Router } from 'express';
import { InventoryItem } from '../../models/inventory-item.js';
import { getMealRecommendations } from '../../services/meal-recommender.js';
import { buildCacheKey, getCached, setCached } from '../../services/recommendations-cache.js';
import { notExpiredQuery } from '../../lib/expiration.js';
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

    if (activeItems.length === 0) {
      res.json({ recommendations: [] as MealRecommendation[] });
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

    const recommendations = await getMealRecommendations(ingredients);

    setCached(cacheKey, recommendations);
    res.json({ recommendations });
  } catch (err) {
    next(err);
  }
});
