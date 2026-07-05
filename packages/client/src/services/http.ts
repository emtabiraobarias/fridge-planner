// Shared fetch-response handling for the browser service layer.
// FR-D-009: a 401 from the API is surfaced as a (re-)authentication prompt — not a
// generic error — via the auth-required signal that <AuthBanner> subscribes to.

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
function readStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}
let authToken: string | null = readStoredToken();
export function setAuthToken(token: string | null): void {
  authToken = token;
}
export function getAuthToken(): string | null {
  return authToken;
}

/** fetch wrapper that attaches `Authorization: Bearer <token>` when a token is set. */
export function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  return fetch(input, { ...init, headers });
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
