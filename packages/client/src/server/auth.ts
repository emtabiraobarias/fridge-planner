import 'server-only';

// TODO: CR-001 -- Replace with proper OAuth 2.0/OIDC validation.
// Development stub: extract userId from the X-User-Id header, defaulting to
// 'anonymous'. In production this should validate Bearer JWTs against an OIDC
// provider. Mirrors the retired Express authMiddleware.
export function getUserId(request: Request): string {
  return request.headers.get('x-user-id') ?? 'anonymous';
}
