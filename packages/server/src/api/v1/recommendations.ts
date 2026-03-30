import { Router } from 'express';
import { z } from 'zod';
import { InventoryItem } from '../../models/inventory-item.js';
import { getMealRecommendations } from '../../services/meal-recommender.js';
import { problemJson } from '../../lib/errors.js';

export const recommendationsRouter = Router();

const requestSchema = z.object({
  dietaryPreferences: z.array(z.string()).optional().default([]),
});

// POST /api/v1/recommendations
recommendationsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      problemJson(res, 400, 'Invalid input', parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }

    // FR-007: exclude expired items from LLM input
    const activeItems = await InventoryItem.find({
      expirationStatus: { $ne: 'expired' },
    });

    if (activeItems.length === 0) {
      res.json({
        recommendations:
          'Your inventory is empty. Add some ingredients to get personalised meal recommendations!',
      });
      return;
    }

    const ingredients = activeItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      ...(item.expiresAt ? { expiresAt: item.expiresAt.toISOString() } : {}),
    }));

    const recommendations = await getMealRecommendations(
      ingredients,
      parsed.data.dietaryPreferences,
    );

    res.json({ recommendations });
  } catch (err) {
    next(err);
  }
});
