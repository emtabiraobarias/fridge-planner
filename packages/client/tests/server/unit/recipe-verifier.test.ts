// @vitest-environment node
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { verifyRecipe, attachVerifiedRecipes } from '@server/services/recipe-verifier';
import type { MealRecommendation } from '@server/types/meal-recommendation';

// Mock global fetch so the REAL verifier logic (query building, domain filtering,
// title-similarity scoring, Spoonacular fallback) runs without live network calls.
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function jsonResponse(body: unknown, ok = true): { ok: boolean; json: () => Promise<unknown> } {
  return { ok, json: async () => body };
}

const braveHit = (title: string, url: string): unknown => ({ web: { results: [{ title, url, description: '' }] } });
const braveEmpty = (): unknown => ({ web: { results: [] } });

const mockMeal: MealRecommendation = {
  mealName: 'Chicken Adobo',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 25,
  cuisine: 'Filipino',
  description: 'Braised chicken in soy sauce and vinegar.',
  usesIngredients: ['chicken breast'],
  expiringIngredients: ['chicken breast'],
  missingIngredients: ['soy sauce'],
};

describe('recipe-verifier', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      BRAVE_SEARCH_API_KEY: 'test-brave-key',
      SPOONACULAR_API_KEY: 'test-spoonacular-key',
    };
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns a verified URL from an approved domain when Brave finds a relevant match', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(braveHit('Chicken Adobo Recipe', 'https://www.recipetineats.com/chicken-adobo/')),
    );
    const result = await verifyRecipe('Chicken Adobo');
    expect(result).toEqual({ recipeUrl: 'https://www.recipetineats.com/chicken-adobo/' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('api.search.brave.com');
    expect(url).toContain('site%3Arecipetineats.com');
  });

  it('rejects a Brave result whose URL is not one of the four approved domains, even if returned', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(braveHit('Chicken Adobo Recipe', 'https://www.allrecipes.com/chicken-adobo/')))
      .mockResolvedValueOnce({ ok: false }); // Spoonacular fallback also misses
    const result = await verifyRecipe('Chicken Adobo');
    expect(result).toBeNull();
  });

  it('rejects a Brave result on an approved domain whose title is unrelated (low similarity)', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(braveHit('Beef Wellington', 'https://www.recipetineats.com/beef-wellington/')))
      .mockResolvedValueOnce({ ok: false }); // falls through to Spoonacular, which also misses
    const result = await verifyRecipe('Chicken Adobo');
    expect(result).toBeNull();
  });

  it('falls back to Spoonacular when no approved-domain match is found', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(braveEmpty()))
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 42, title: 'Chicken Adobo', image: 'https://img.spoonacular.com/42.jpg' }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ sourceUrl: 'https://www.food.com/chicken-adobo', image: 'https://img.spoonacular.com/42.jpg' }));

    const result = await verifyRecipe('Chicken Adobo');
    expect(result).toEqual({ recipeUrl: 'https://www.food.com/chicken-adobo', imageUrl: 'https://img.spoonacular.com/42.jpg' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('falls back to the search-result image and never surfaces a malformed /information image URL', async () => {
    // Real Spoonacular quirk: /information can return an image with an empty imageType,
    // producing a trailing-dot URL with no extension. It must not become an <img> src.
    mockFetch
      .mockResolvedValueOnce(jsonResponse(braveEmpty()))
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 653775, title: 'Chicken Adobo', image: 'https://img.spoonacular.com/recipes/653775-312x231.jpg' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ sourceUrl: 'https://www.foodista.com/chicken-adobo', image: 'https://img.spoonacular.com/recipes/653775-556x370.' }),
      );

    const result = await verifyRecipe('Chicken Adobo');
    expect(result).toEqual({
      recipeUrl: 'https://www.foodista.com/chicken-adobo',
      imageUrl: 'https://img.spoonacular.com/recipes/653775-312x231.jpg',
    });
  });

  it('omits imageUrl entirely when no well-formed image is available (still keeps recipeUrl)', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(braveEmpty()))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 99, title: 'Chicken Adobo' }] }))
      .mockResolvedValueOnce(jsonResponse({ sourceUrl: 'https://www.food.com/chicken-adobo', image: 'https://img.spoonacular.com/recipes/99-556x370.' }));

    const result = await verifyRecipe('Chicken Adobo');
    expect(result).toEqual({ recipeUrl: 'https://www.food.com/chicken-adobo' });
    expect(result).not.toHaveProperty('imageUrl');
  });

  it('returns null when both approved-domain search and Spoonacular fail to find a match', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(braveEmpty()))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    const result = await verifyRecipe('Chicken Adobo');
    expect(result).toBeNull();
  });

  it('never fabricates on a network/API error — degrades to null', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down')).mockRejectedValueOnce(new Error('network down'));
    const result = await verifyRecipe('Chicken Adobo');
    expect(result).toBeNull();
  });

  it('skips Brave entirely (no fetch call) when BRAVE_SEARCH_API_KEY is unset', async () => {
    delete process.env['BRAVE_SEARCH_API_KEY'];
    mockFetch.mockResolvedValueOnce(jsonResponse({ results: [] })); // only Spoonacular's complexSearch call
    await verifyRecipe('Chicken Adobo');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('spoonacular.com');
  });

  it('returns null immediately with no fetch calls when neither API key is set', async () => {
    delete process.env['BRAVE_SEARCH_API_KEY'];
    delete process.env['SPOONACULAR_API_KEY'];
    const result = await verifyRecipe('Chicken Adobo');
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('attachVerifiedRecipes enriches only the meals with a confident match, leaving others untouched', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(braveHit('Chicken Adobo', 'https://www.kawalingpinoy.com/chicken-adobo/')))
      .mockResolvedValueOnce(jsonResponse(braveEmpty())) // second meal: Brave miss
      .mockResolvedValueOnce(jsonResponse({ results: [] })); // second meal: Spoonacular miss too

    const secondMeal: MealRecommendation = { ...mockMeal, mealName: 'Obscure Dish With No Match' };
    const enriched = await attachVerifiedRecipes([mockMeal, secondMeal]);

    expect(enriched[0]).toMatchObject({ mealName: 'Chicken Adobo', recipeUrl: 'https://www.kawalingpinoy.com/chicken-adobo/' });
    expect(enriched[1]).not.toHaveProperty('recipeUrl');
    expect(enriched[1]).not.toHaveProperty('imageUrl');
  });
});
