'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setAuthToken, setRefreshToken, onTokenRefreshed } from '../services/http';

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
function endSessionEndpoint(): string {
  return `${issuer()}/protocol/openid-connect/logout`;
}

/**
 * RP-initiated logout URL (spec 002 FR-D-011). Returns null when the issuer is not
 * configured, which is the signal for the caller to take the FR-D-014 local-only path
 * rather than navigate somewhere meaningless.
 *
 * ⚠️ The IdP must have this `post_logout_redirect_uri` registered (Keycloak: the SPA
 * client's "Valid post logout redirect URIs") or it refuses the redirect. That is a
 * MANUAL step — see docs/deployment.md.
 */
export function endSessionUrl(origin: string): string | null {
  if (!issuer()) return null;
  const params = new URLSearchParams({
    post_logout_redirect_uri: origin,
    client_id: clientId(),
  });
  return `${endSessionEndpoint()}?${params.toString()}`;
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

export interface TokenPair {
  accessToken: string;
  /** null when the IdP issues no refresh token — the session then ends with the access token. */
  refreshToken: string | null;
}

/** Exchange an authorization code for tokens (PKCE), validating the returned state. */
export async function exchangeCodeForToken(
  origin: string,
  code: string,
  returnedState: string,
): Promise<TokenPair> {
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
  const data = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (!data.access_token) throw new Error('Token response missing access_token');
  window.sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  window.sessionStorage.removeItem(OIDC_STATE_KEY);
  // FR-D-010: keep the refresh token — it is what lets the session survive access-token
  // expiry (transparent renewal in services/http) up to the IdP's 12h idle window.
  return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null };
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

  // FR-D-010: when the service layer transparently renews the token, follow it here so
  // React state (and sessionStorage, written below via setToken) stay consistent.
  useEffect(() => onTokenRefreshed((token) => setToken(token)), []);

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
    const pair = await exchangeCodeForToken(window.location.origin, code, state);
    setRefreshToken(pair.refreshToken);
    setToken(pair.accessToken);
  }

  /**
   * Sign out (spec 002 FR-D-011/014/015/016).
   *
   * Clears the local session, then **navigates** — either to the IdP's end-session
   * endpoint (which returns here signed out), or, if that URL cannot be built, straight
   * to the app origin.
   *
   * The navigation is not incidental: it is how FR-D-016 ("no previous-user data
   * readable after sign-out") is satisfied. Six data-holding providers sit under this
   * one — Inventory, MealPlan, Pipeline, Placement, QuickAdd, Recommendations — and
   * their React state survives a token clear, so without a page load a signed-out screen
   * would still be showing the previous user's kitchen. Resetting each context instead
   * would be six files and six chances to forget the seventh; a page load cannot be
   * partially applied. The fallback path navigates for exactly the same reason — if it
   * did not, the failure path would be the only one that leaks (plan D-S1).
   *
   * No confirmation (FR-D-015): sign-out is reversible and cheap.
   */
  function logout(): void {
    setRefreshToken(null);
    setToken(null);
    if (typeof window === 'undefined') return;
    const url = endSessionUrl(window.location.origin);
    // `replace`, not `assign`: the signed-out user must not be able to press Back into
    // a rendered view of the previous session.
    window.location.replace(url ?? '/');
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
