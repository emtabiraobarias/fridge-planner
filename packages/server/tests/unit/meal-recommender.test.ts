import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getMealRecommendations } from '../../src/services/meal-recommender.js';

const mockFetch = jest.fn();
global.fetch = mockFetch as typeof fetch;

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

  it('sends ingredients as a formatted message to holodeck', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: 'Try chicken fried rice!',
        tool_calls: [],
        execution_time_ms: 200,
      }),
    });

    const ingredients = [
      { name: 'chicken breast', quantity: 2, unit: 'lbs', expiresAt: '2026-03-31' },
      { name: 'rice', quantity: 1, unit: 'cup', expiresAt: '2026-06-01' },
    ];

    const result = await getMealRecommendations(ingredients);

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8001/chat/sync',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toBe('Try chicken fried rice!');
  });

  it('throws on non-ok holodeck response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
    });
    await expect(getMealRecommendations([])).rejects.toThrow('502');
  });
});
