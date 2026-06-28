/** Thrown by the auth middleware on any token failure; mapped to 401 by error-handler. */
export class AuthError extends Error {
  readonly status = 401;
  constructor(public readonly detail: string) {
    super(detail);
    this.name = 'AuthError';
  }
}
