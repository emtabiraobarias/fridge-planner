import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import {
  AuthProvider,
  useAuth,
  createAuthorizationRequest,
  exchangeCodeForToken,
} from '../../src/context/AuthContext';
import { getAuthToken } from '../../src/services/http';

function Harness(): React.JSX.Element {
  const { isAuthenticated, setToken } = useAuth();
  return (
    <div>
      <span data-testid="state">{isAuthenticated ? 'in' : 'out'}</span>
      <button onClick={() => setToken('abc')}>set</button>
    </div>
  );
}

describe('createAuthorizationRequest (E0b — PKCE)', () => {
  afterEach(() => {
    delete process.env['NEXT_PUBLIC_OIDC_ISSUER'];
    delete process.env['NEXT_PUBLIC_OIDC_CLIENT_ID'];
    delete process.env['NEXT_PUBLIC_OIDC_REDIRECT_URI'];
  });

  it('targets the Keycloak authorization endpoint with a PKCE S256 challenge', async () => {
    process.env['NEXT_PUBLIC_OIDC_ISSUER'] = 'https://auth.example.com:8443/realms/fridge-planner/';
    process.env['NEXT_PUBLIC_OIDC_CLIENT_ID'] = 'fridge-planner-app';
    const { url, verifier, state } = await createAuthorizationRequest('https://app.example.com:8443');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://auth.example.com:8443/realms/fridge-planner/protocol/openid-connect/auth',
    );
    expect(parsed.searchParams.get('client_id')).toBe('fridge-planner-app');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('code_challenge')).toBeTruthy();
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.example.com:8443/auth/callback');
    expect(parsed.searchParams.get('state')).toBe(state);
    expect(verifier.length).toBeGreaterThanOrEqual(43); // 32 bytes → 43 base64url chars
  });
});

describe('exchangeCodeForToken (E0b)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    process.env['NEXT_PUBLIC_OIDC_ISSUER'] = 'https://auth.example.com:8443/realms/fridge-planner';
    process.env['NEXT_PUBLIC_OIDC_CLIENT_ID'] = 'fridge-planner-app';
  });
  afterEach(() => {
    delete process.env['NEXT_PUBLIC_OIDC_ISSUER'];
    delete process.env['NEXT_PUBLIC_OIDC_CLIENT_ID'];
  });

  it('posts code + verifier to the token endpoint and returns the access token', async () => {
    window.sessionStorage.setItem('fp_oidc_state', 'st8');
    window.sessionStorage.setItem('fp_pkce_verifier', 'ver1');
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'tok-xyz' }) });
    vi.stubGlobal('fetch', f);

    const token = await exchangeCodeForToken('https://app.example.com:8443', 'auth-code', 'st8');

    expect(token).toBe('tok-xyz');
    const [endpoint, init] = f.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe(
      'https://auth.example.com:8443/realms/fridge-planner/protocol/openid-connect/token',
    );
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('code=auth-code');
    expect(body).toContain('code_verifier=ver1');
    // one-time values are cleared after a successful exchange
    expect(window.sessionStorage.getItem('fp_pkce_verifier')).toBeNull();
  });

  it('rejects when the returned state does not match (CSRF guard)', async () => {
    window.sessionStorage.setItem('fp_oidc_state', 'expected');
    window.sessionStorage.setItem('fp_pkce_verifier', 'ver1');
    await expect(
      exchangeCodeForToken('https://app.example.com:8443', 'auth-code', 'tampered'),
    ).rejects.toThrow(/state mismatch/i);
  });
});

describe('AuthProvider (E0)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('setToken makes the user authenticated and syncs the token to the service layer', () => {
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );
    expect(screen.getByTestId('state')).toHaveTextContent('out');
    act(() => {
      screen.getByText('set').click();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('in');
    expect(getAuthToken()).toBe('abc');
    expect(window.sessionStorage.getItem('fp_access_token')).toBe('abc');
  });
});
