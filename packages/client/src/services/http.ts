// Shared fetch-response handling for the browser service layer.
// FR-D-009: a 401 from the API is surfaced as a (re-)authentication prompt — not a
// generic error — via the auth-required signal that <AuthBanner> subscribes to.
// FR-D-010: before that prompt ever fires, an expired access token is renewed
// TRANSPARENTLY via the OIDC refresh-token grant (single-flight) and the failed
// request is retried once — the user keeps their in-flight work.

export class AuthRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredError';
  }
}

type Listener = () => void;
const listeners = new Set<Listener>();

// E0 (Phase E): the browser carries an OIDC access token so requests are authenticated
// under AUTH_MODE=oidc. AuthProvider sets it; apiFetch attaches it as a Bearer header.
// Seed synchronously from sessionStorage at module load so the very first request on a
// page reload (before AuthProvider's effect runs) already carries the token — otherwise
// the initial inventory/meal-plan fetches race ahead unauthenticated and 401.
const TOKEN_STORAGE_KEY = 'fp_access_token';
const REFRESH_STORAGE_KEY = 'fp_refresh_token';

function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // storage unavailable — tokens stay in-memory only
  }
}

let authToken: string | null = readStored(TOKEN_STORAGE_KEY);
let refreshToken: string | null = readStored(REFRESH_STORAGE_KEY);

export function setAuthToken(token: string | null): void {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}
/** Store the OIDC refresh token (FR-D-010). Pass null to clear (logout / renewal failure). */
export function setRefreshToken(token: string | null): void {
  refreshToken = token;
  writeStored(REFRESH_STORAGE_KEY, token);
}

// AuthProvider subscribes so its React state follows tokens renewed down here.
type TokenListener = (accessToken: string) => void;
const refreshListeners = new Set<TokenListener>();
export function onTokenRefreshed(handler: TokenListener): () => void {
  refreshListeners.add(handler);
  return () => refreshListeners.delete(handler);
}

function tokenEndpoint(): string {
  const issuer = (process.env['NEXT_PUBLIC_OIDC_ISSUER'] ?? '').replace(/\/$/, '');
  return `${issuer}/protocol/openid-connect/token`;
}

// Single-flight: concurrent 401s share one refresh round-trip.
let refreshInFlight: Promise<boolean> | null = null;

/**
 * FR-D-010: renew the access token via the refresh grant. Returns true when a new
 * access token is in place. On failure both tokens are cleared, so the caller's 401
 * falls through to the FR-D-009 re-auth prompt.
 */
async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  refreshInFlight ??= (async (): Promise<boolean> => {
    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env['NEXT_PUBLIC_OIDC_CLIENT_ID'] ?? '',
        refresh_token: refreshToken as string,
      });
      const res = await fetch(tokenEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { access_token?: string; refresh_token?: string };
      if (!data.access_token) return false;
      authToken = data.access_token;
      writeStored(TOKEN_STORAGE_KEY, authToken);
      // Keycloak rotates refresh tokens; keep the newest one when provided.
      if (data.refresh_token) setRefreshToken(data.refresh_token);
      refreshListeners.forEach((l) => l(data.access_token as string));
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  const ok = await refreshInFlight;
  if (!ok) {
    // Renewal failed (idle > IdP session, revoked, IdP down): clear so we don't loop.
    authToken = null;
    writeStored(TOKEN_STORAGE_KEY, null);
    setRefreshToken(null);
  }
  return ok;
}

function rawFetch(input: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  else headers.delete('Authorization');
  return fetch(input, { ...init, headers });
}

/**
 * fetch wrapper that attaches `Authorization: Bearer <token>` when a token is set.
 * FR-D-010: a 401 triggers one transparent refresh + retry before being returned.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await rawFetch(input, init);
  if (res.status !== 401 || !refreshToken) return res;
  const renewed = await refreshAccessToken();
  if (!renewed) return res;
  return rawFetch(input, init);
}

/** Subscribe to auth-required (401) signals. Returns an unsubscribe function. */
export function onAuthRequired(handler: Listener): () => void {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

/**
 * Assert a fetch Response is OK. A `401` emits the auth-required signal and throws
 * AuthRequiredError (so callers/UI prompt re-auth); other non-2xx throw a generic Error.
 */
export function ensureOk(res: Response, action: string): Response {
  if (res.status === 401) {
    listeners.forEach((l) => l());
    throw new AuthRequiredError();
  }
  if (!res.ok) {
    throw new Error(`Failed to ${action}: ${res.status}`);
  }
  return res;
}
