import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getMealRecommendations } from '../../src/services/meal-recommender.js';
import type { MealRecommendation } from '../../src/types/meal-recommendation.js';

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

const mockMeal: MealRecommendation = {
  mealName: 'Chicken Fried Rice',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 25,
  cuisine: 'Asian',
  description: 'A quick one-pan meal using leftover rice and chicken.',
  usesIngredients: ['chicken breast', 'rice'],
  expiringIngredients: ['chicken breast'],
  missingIngredients: ['soy sauce'],
};

describe('getMealRecommendations', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, HOLODECK_URL: 'http://localhost:8001' };
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when HOLODECK_URL is not set', async () => {
    delete process.env['HOLODECK_URL'];
    await expect(getMealRecommendations([])).rejects.toThrow('HOLODECK_URL');
  });

  it('calls the correct holodeck endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: JSON.stringify([mockMeal]),
        session_id: 'sess-1',
        tool_calls: [],
        tokens_used: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
        execution_time_ms: 200,
      }),
    });

    await getMealRecommendations([
      { name: 'chicken breast', quantity: 2, unit: 'lbs', expiresAt: '2026-03-31' },
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8001/agent/meal-recommender/chat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns a MealRecommendation array parsed from holodeck message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: JSON.stringify([mockMeal]),
        session_id: 'sess-1',
        tool_calls: [],
        tokens_used: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
        execution_time_ms: 200,
      }),
    });

    const ingredients = [
      { name: 'chicken breast', quantity: 2, unit: 'lbs', expiresAt: '2026-03-31' },
      { name: 'rice', quantity: 1, unit: 'cup', expiresAt: '2026-06-01' },
    ];

    const result = await getMealRecommendations(ingredients);

    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({
      mealName: 'Chicken Fried Rice',
      suggestedMealType: 'dinner',
      prepTimeMinutes: 25,
    });
  });

  it('includes dietary preferences in the message body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: JSON.stringify([mockMeal]),
        session_id: 'sess-1',
        tool_calls: [],
        tokens_used: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
        execution_time_ms: 200,
      }),
    });

    await getMealRecommendations(
      [{ name: 'rice', quantity: 1, unit: 'cup' }],
      ['vegetarian', 'gluten-free'],
    );

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, { body: string }])[1].body) as { message: string };
    expect(body.message).toContain('vegetarian');
    expect(body.message).toContain('gluten-free');
  });

  it('throws on non-ok holodeck response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
    });
    await expect(getMealRecommendations([])).rejects.toThrow('502');
  });

  it('throws when holodeck returns non-JSON message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: 'Here are some meals for you...',
        session_id: 'sess-1',
        tool_calls: [],
        tokens_used: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
        execution_time_ms: 200,
      }),
    });
    await expect(getMealRecommendations([])).rejects.toThrow('non-JSON');
  });

  it('throws when holodeck returns a JSON object instead of array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: JSON.stringify({ mealName: 'Oops' }),
        session_id: 'sess-1',
        tool_calls: [],
        tokens_used: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
        execution_time_ms: 200,
      }),
    });
    await expect(getMealRecommendations([])).rejects.toThrow('not a JSON array');
  });
});
