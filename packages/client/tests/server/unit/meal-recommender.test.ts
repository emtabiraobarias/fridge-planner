// @vitest-environment node
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMealRecommendations } from '@server/services/meal-recommender';
import type { MealRecommendation } from '@server/types/meal-recommendation';

// Mock global fetch so the REAL meal-recommender client logic runs (prompt build,
// HTTP call, response parse, error branches) without a live Holodeck sidecar.
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const mockMeal: MealRecommendation = {
  mealName: 'Chicken Fried Rice',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 25,
  cuisine: 'Asian',
  description: 'A quick one-pan meal using leftover rice and chicken.',
  usesIngredients: ['chicken breast', 'rice'],
  expiringIngredients: ['chicken breast'],
  missingIngredients: ['soy sauce'],
  recipeUrl: 'https://www.allrecipes.com/recipe/16954/chicken-fried-rice/',
  imageUrl: 'https://www.allrecipes.com/thmb/yOBFTCjJJBkziqXSfJwwHxRqkqQ=/chicken-fried-rice.jpg',
};

function holodeckOk(content: string): { ok: true; json: () => Promise<unknown> } {
  return {
    ok: true,
    json: async () => ({
      content,
      session_id: 'sess-1',
      tool_calls: [],
      tokens_used: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
      execution_time_ms: 200,
    }),
  };
}

describe('getMealRecommendations (Holodeck agent client)', () => {
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

  it('calls the correct holodeck endpoint with POST', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk(JSON.stringify([mockMeal])));
    await getMealRecommendations([{ name: 'chicken breast', quantity: 2, unit: 'lbs', expiresAt: '2026-03-31' }]);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8001/agent/meal-recommender/chat',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('includes an exclusion instruction in the prompt when excludeMealNames is given (FR-037)', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk(JSON.stringify([mockMeal])));
    await getMealRecommendations(
      [{ name: 'chicken breast', quantity: 2, unit: 'lbs' }],
      ['Chicken Stir-fry', 'Chicken Adobo'],
    );
    const body = JSON.parse((mockFetch.mock.calls[0]?.[1] as { body: string }).body) as { message: string };
    expect(body.message).toContain('Do NOT suggest any of these meals');
    expect(body.message).toContain('Chicken Stir-fry, Chicken Adobo');
  });

  it('omits the exclusion instruction when excludeMealNames is empty', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk(JSON.stringify([mockMeal])));
    await getMealRecommendations([{ name: 'chicken breast', quantity: 2, unit: 'lbs' }]);
    const body = JSON.parse((mockFetch.mock.calls[0]?.[1] as { body: string }).body) as { message: string };
    expect(body.message).not.toContain('Do NOT suggest');
  });

  it('parses a MealRecommendation array from the holodeck message', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk(JSON.stringify([mockMeal])));
    const result = await getMealRecommendations([
      { name: 'chicken breast', quantity: 2, unit: 'lbs', expiresAt: '2026-03-31' },
      { name: 'rice', quantity: 1, unit: 'cup', expiresAt: '2026-06-01' },
    ]);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({ mealName: 'Chicken Fried Rice', suggestedMealType: 'dinner', prepTimeMinutes: 25 });
  });

  it('parses a MealRecommendation array wrapped in a ```json markdown fence', async () => {
    const fenced = '```json\n' + JSON.stringify([mockMeal], null, 2) + '\n```';
    mockFetch.mockResolvedValueOnce(holodeckOk(fenced));
    const result = await getMealRecommendations([
      { name: 'chicken breast', quantity: 2, unit: 'lbs' },
    ]);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({ mealName: 'Chicken Fried Rice' });
  });

  it('throws on a non-ok holodeck response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502, text: async () => 'Bad Gateway' });
    await expect(getMealRecommendations([])).rejects.toThrow('502');
  });

  it('throws when holodeck returns a non-JSON message', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk('Here are some meals for you...'));
    await expect(getMealRecommendations([])).rejects.toThrow('non-JSON');
  });

  it('throws when holodeck returns a JSON object instead of an array', async () => {
    mockFetch.mockResolvedValueOnce(holodeckOk(JSON.stringify({ mealName: 'Oops' })));
    await expect(getMealRecommendations([])).rejects.toThrow('not a JSON array');
  });
});
