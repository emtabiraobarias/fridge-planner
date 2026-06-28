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
