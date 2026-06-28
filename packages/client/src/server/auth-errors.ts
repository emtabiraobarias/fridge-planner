/** Thrown by the auth layer on any token failure; mapped to a 401 Problem JSON by withRoute(). */
export class AuthError extends Error {
  readonly status = 401;
  constructor(public readonly detail: string) {
    super(detail);
    this.name = 'AuthError';
  }
}
