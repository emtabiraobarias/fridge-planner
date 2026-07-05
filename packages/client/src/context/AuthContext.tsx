'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setAuthToken } from '../services/http';

// E0 (Phase E): client-side OIDC. E0a = token store + Bearer injection (services/http).
// E0b (here) = the full authorization-code + PKCE flow against Keycloak:
//   login() -> redirect to the IdP authorization endpoint with a PKCE challenge
//   /auth/callback -> completeLogin() exchanges the code (+ verifier) for an access token.
// Endpoints are derived from NEXT_PUBLIC_OIDC_ISSUER using Keycloak's realm paths.
// These NEXT_PUBLIC_* values are baked into the client bundle at build time.

const STORAGE_KEY = 'fp_access_token';
const PKCE_VERIFIER_KEY = 'fp_pkce_verifier';
const OIDC_STATE_KEY = 'fp_oidc_state';

function issuer(): string {
  return (process.env['NEXT_PUBLIC_OIDC_ISSUER'] ?? '').replace(/\/$/, '');
}
function clientId(): string {
  return process.env['NEXT_PUBLIC_OIDC_CLIENT_ID'] ?? '';
}
function resolveRedirectUri(origin: string): string {
  return process.env['NEXT_PUBLIC_OIDC_REDIRECT_URI'] ?? `${origin}/auth/callback`;
}
function authorizationEndpoint(): string {
  return `${issuer()}/protocol/openid-connect/auth`;
}
function tokenEndpoint(): string {
  return `${issuer()}/protocol/openid-connect/token`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomUrlToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}
async function computeCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

/** Build the authorization-endpoint URL plus the PKCE verifier + CSRF state to persist. */
export async function createAuthorizationRequest(
  origin: string,
): Promise<{ url: string; verifier: string; state: string }> {
  const verifier = randomUrlToken(32);
  const state = randomUrlToken(16);
  const challenge = await computeCodeChallenge(verifier);
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: resolveRedirectUri(origin),
    response_type: 'code',
    scope: 'openid profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return { url: `${authorizationEndpoint()}?${params.toString()}`, verifier, state };
}

/** Exchange an authorization code for an access token (PKCE), validating the returned state. */
export async function exchangeCodeForToken(
  origin: string,
  code: string,
  returnedState: string,
): Promise<string> {
  const savedState = window.sessionStorage.getItem(OIDC_STATE_KEY);
  const verifier = window.sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!savedState || savedState !== returnedState) {
    throw new Error('OIDC state mismatch — possible CSRF; restart sign-in');
  }
  if (!verifier) throw new Error('Missing PKCE verifier — restart sign-in');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: resolveRedirectUri(origin),
    client_id: clientId(),
    code_verifier: verifier,
  });
  const res = await fetch(tokenEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Token response missing access_token');
  window.sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  window.sessionStorage.removeItem(OIDC_STATE_KEY);
  return data.access_token;
}

interface AuthState {
  accessToken: string | null;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  setToken: (token: string | null) => void;
  completeLogin: (code: string, state: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // Lazy-init from sessionStorage so accessToken is correct on the first render and the
  // service-layer sync never transiently clears a valid token (avoids the reload 401 race).
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? window.sessionStorage.getItem(STORAGE_KEY) : null,
  );

  // Keep the service layer's token in sync.
  useEffect(() => {
    setAuthToken(accessToken);
  }, [accessToken]);

  function setToken(token: string | null): void {
    setAccessToken(token);
    if (typeof window === 'undefined') return;
    if (token) window.sessionStorage.setItem(STORAGE_KEY, token);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  }

  function login(): void {
    if (typeof window === 'undefined') return;
    void (async (): Promise<void> => {
      const { url, verifier, state } = await createAuthorizationRequest(window.location.origin);
      window.sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
      window.sessionStorage.setItem(OIDC_STATE_KEY, state);
      window.location.assign(url);
    })();
  }

  async function completeLogin(code: string, state: string): Promise<void> {
    const token = await exchangeCodeForToken(window.location.origin, code, state);
    setToken(token);
  }

  function logout(): void {
    setToken(null);
  }

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: accessToken !== null,
        login,
        logout,
        setToken,
        completeLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
