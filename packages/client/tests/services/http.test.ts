// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiFetch, setAuthToken, setRefreshToken, getAuthToken } from '../../src/services/http';

describe('apiFetch — Bearer token attachment (E0)', () => {
  beforeEach(() => {
    setAuthToken(null);
    vi.restoreAllMocks();
  });

  it('omits Authorization when no token is set', async () => {
    const f = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', f);
    await apiFetch('/api/v1/inventory');
    const headers = new Headers((f.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('attaches Authorization: Bearer <token> and preserves existing headers', async () => {
    const f = vi.fn().mockResolvedValue({});
    vi.stubGlobal('fetch', f);
    setAuthToken('tok123');
    await apiFetch('/api/v1/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const headers = new Headers((f.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer tok123');
    expect(headers.get('Content-Type')).toBe('application/json');
  });
});

describe('apiFetch — transparent token refresh (FR-D-010)', () => {
  const TOKEN_URL =
    'https://auth.example.com:8443/realms/fridge-planner/protocol/openid-connect/token';

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_OIDC_ISSUER', 'https://auth.example.com:8443/realms/fridge-planner');
    vi.stubEnv('NEXT_PUBLIC_OIDC_CLIENT_ID', 'fridge-planner-app');
    setAuthToken('stale-token');
    setRefreshToken('refresh-1');
  });

  afterEach(() => {
    setAuthToken(null);
    setRefreshToken(null);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('renews on 401 and retries the request once with the new token', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'fresh-token', refresh_token: 'refresh-2' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);

    const res = await apiFetch('/api/v1/inventory');

    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(3);
    // 2nd call: the refresh grant.
    const [url, init] = f.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(TOKEN_URL);
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=refresh-1');
    // 3rd call: the retry carries the renewed token.
    const retryHeaders = new Headers((f.mock.calls[2] as [string, RequestInit])[1].headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer fresh-token');
    expect(getAuthToken()).toBe('fresh-token');
  });

  it('returns the original 401 and clears tokens when the refresh grant fails', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 400 }));
    vi.stubGlobal('fetch', f);

    const res = await apiFetch('/api/v1/inventory');

    expect(res.status).toBe(401);
    expect(f).toHaveBeenCalledTimes(2); // no retry without a renewed token
    expect(getAuthToken()).toBeNull(); // cleared → FR-D-009 prompt path
  });

  it('shares a single refresh round-trip across concurrent 401s (single-flight)', async () => {
    let refreshCalls = 0;
    const f = vi.fn((url: string) => {
      if (url === TOKEN_URL) {
        refreshCalls++;
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'fresh-token' }), { status: 200 }),
        );
      }
      const headers = new Headers((f.mock.calls[f.mock.calls.length - 1] as [string, RequestInit])[1]?.headers);
      const status = headers.get('Authorization') === 'Bearer fresh-token' ? 200 : 401;
      return Promise.resolve(new Response(null, { status }));
    });
    vi.stubGlobal('fetch', f);

    const [a, b] = await Promise.all([apiFetch('/api/v1/inventory'), apiFetch('/api/v1/meal-plans')]);

    expect(refreshCalls).toBe(1);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
  });

  it('makes no refresh attempt without a stored refresh token', async () => {
    setRefreshToken(null);
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', f);

    const res = await apiFetch('/api/v1/inventory');

    expect(res.status).toBe(401);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
