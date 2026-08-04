/** Thrown by the auth layer on any token failure; mapped to a 401 Problem JSON by withRoute(). */
export class AuthError extends Error {
  readonly status = 401;
  constructor(public readonly detail: string) {
    super(detail);
    this.name = 'AuthError';
  }
}

/**
 * Thrown when a caller is authenticated but lacks the privilege for the action;
 * mapped to a **403** Problem JSON by withRoute() (spec 011 FR-AD-003).
 *
 * Deliberately distinct from AuthError: `src/services/http.ts` treats 401 as the
 * FR-D-010 refresh-and-retry trigger, so returning 401 to a valid-but-unprivileged
 * caller would burn a token refresh retrying a request that can never succeed.
 */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(public readonly detail: string) {
    super(detail);
    this.name = 'ForbiddenError';
  }
}
