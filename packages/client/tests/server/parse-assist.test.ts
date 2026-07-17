// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// No DB needed — the parse-assist endpoint only talks to the (mocked) OpenAI API.
let POST: typeof import('../../app/api/v1/quick-add/parse/route').POST;

const mockFetch = vi.fn();

beforeAll(async () => {
  vi.stubGlobal('fetch', mockFetch);
  ({ POST } = await import('../../app/api/v1/quick-add/parse/route'));
});

beforeEach(() => {
  mockFetch.mockReset();
  process.env['OPENAI_API_KEY'] = 'test-key';
});

afterEach(() => {
  delete process.env['OPENAI_API_KEY'];
});

function req(body: unknown, userId = 'u1'): Request {
  return new Request('http://localhost/api/v1/quick-add/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': userId },
    body: JSON.stringify(body),
  });
}

function openaiResponse(payload: unknown): { ok: boolean; status: number; json: () => Promise<unknown> } {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
  };
}

describe('POST /api/v1/quick-add/parse (spec 005 US4, FR-IQ-019..022)', () => {
  it('returns an enum-valid interpretation', async () => {
    mockFetch.mockResolvedValue(
      openaiResponse({
        name: 'Gochujang',
        quantity: 1,
        unit: 'jar',
        category: 'Condiments',
        location: 'fridge',
        shelfLifeDays: 90,
      }),
    );
    const res = await POST(req({ text: 'gochujang' }));
    expect(res.status).toBe(200);
    const { interpretation } = (await res.json()) as { interpretation: Record<string, unknown> };
    expect(interpretation).toMatchObject({
      name: 'Gochujang',
      category: 'Condiments',
      location: 'fridge',
      unit: 'jar',
      shelfLifeDays: 90,
    });
  });

  it('drops invalid fields field-wise instead of failing (FR-IQ-020)', async () => {
    mockFetch.mockResolvedValue(
      openaiResponse({
        name: 'Fish Sauce',
        category: 'Fermented',
        location: 'garage',
        unit: 'hogshead',
        shelfLifeDays: 9000,
      }),
    );
    const res = await POST(req({ text: 'fish sauce' }));
    expect(res.status).toBe(200);
    const { interpretation } = (await res.json()) as { interpretation: Record<string, unknown> };
    expect(interpretation!['name']).toBe('Fish Sauce');
    expect(interpretation!['category']).toBeUndefined();
    expect(interpretation!['location']).toBeUndefined();
    expect(interpretation!['unit']).toBeUndefined();
    expect(interpretation!['shelfLifeDays']).toBeUndefined();
  });

  it('returns interpretation null when the model replies with junk', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
    });
    const res = await POST(req({ text: 'mystery paste' }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { interpretation: unknown }).interpretation).toBeNull();
  });

  it('serves repeat identical inputs from the cache (FR-IQ-022)', async () => {
    mockFetch.mockResolvedValue(openaiResponse({ name: 'Miso', category: 'Condiments' }));
    await POST(req({ text: 'white miso paste' }));
    await POST(req({ text: '  White  Miso   Paste ' })); // normalised → same key
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when assistance is not configured', async () => {
    delete process.env['OPENAI_API_KEY'];
    const res = await POST(req({ text: 'gochujang unconfigured' }));
    expect(res.status).toBe(503);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 503 when the upstream call fails (client stays fail-open)', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    const res = await POST(req({ text: 'kimchi paste fresh' }));
    expect(res.status).toBe(503);
  });

  it('rejects invalid bodies (400)', async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ text: '' }))).status).toBe(400);
    expect((await POST(req({ text: 'x'.repeat(201) }))).status).toBe(400);
  });

  it('rate-limits at 20/min per user (429)', async () => {
    mockFetch.mockResolvedValue(openaiResponse({ name: 'X' }));
    let last = 0;
    for (let i = 0; i < 21; i++) {
      const res = await POST(req({ text: `item variant ${i}` }, 'rl-user'));
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
