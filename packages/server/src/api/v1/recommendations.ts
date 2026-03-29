import { Router } from 'express';
import { getMealRecommendations } from '../../services/meal-recommender.js';

export const recommendationsRouter = Router();

// POST /api/v1/recommendations
recommendationsRouter.post('/', async (req, res, next) => {
  try {
    const { ingredients } = req.body as { ingredients: unknown };
    if (!Array.isArray(ingredients)) {
      res.status(400).json({
        type: 'https://fridge-planner.dev/errors/invalid-input',
        title: 'Invalid input',
        status: 400,
        detail: 'ingredients must be an array',
      });
      return;
    }
    const content = await getMealRecommendations(ingredients);
    res.json({ recommendations: content });
  } catch (err) {
    next(err);
  }
});
