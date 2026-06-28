import 'server-only';
import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { AuthError } from './auth-errors';

// CR-001/CR-002 (spec 002): validate an OIDC Bearer JWT and derive the user identity
// from the `sub` claim. Two modes (FR-D-007):
//   - dev : trust the X-User-Id header (local dev + the test suites) — the seam.
//   - oidc: verify signature (JWKS) + iss/aud/exp; production MUST use this.
// Env is read at call time so tests can toggle modes.

type JWKS = JWTVerifyGetKey;
const globalForJwks = globalThis as unknown as { _authJwks?: JWKS };

/** Cached JWKS resolver (also the test-injection seam — set `globalThis._authJwks`). */
function jwks(): JWKS {
  if (!globalForJwks._authJwks) {
    const uri = process.env['AUTH_JWKS_URI'];
    if (!uri) throw new AuthError('Authentication is not configured');
    globalForJwks._authJwks = createRemoteJWKSet(new URL(uri));
  }
  return globalForJwks._authJwks;
}

function resolveMode(): 'dev' | 'oidc' {
  const mode = process.env['AUTH_MODE'] ?? (process.env['NODE_ENV'] === 'production' ? 'oidc' : 'dev');
  // FR-D-007/FR-D-008: the dev seam must never be a production auth path.
  if (process.env['NODE_ENV'] === 'production' && mode !== 'oidc') {
    throw new Error('AUTH_MODE must be "oidc" in production — the dev auth seam is disabled');
  }
  return mode === 'oidc' ? 'oidc' : 'dev';
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/i.exec(header);
  return match?.[1] ?? null;
}

/**
 * Resolve the authenticated user id for a request, or throw AuthError (→ 401).
 * Replaces the old `getUserId` X-User-Id stub. Identity flows unchanged into the
 * controllers, which scope every query by userId (FR-036).
 */
export async function authenticate(request: Request): Promise<string> {
  if (resolveMode() === 'dev') {
    return request.headers.get('x-user-id') ?? 'anonymous';
  }

  const token = bearerToken(request);
  if (!token) throw new AuthError('Missing bearer token');

  // Build options without `undefined` (exactOptionalPropertyTypes).
  const options: { issuer?: string; audience?: string; clockTolerance: number } = { clockTolerance: 5 };
  const issuer = process.env['AUTH_ISSUER'];
  const audience = process.env['AUTH_AUDIENCE'];
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;

  try {
    const { payload } = await jwtVerify(token, jwks(), options);
    if (!payload.sub) throw new AuthError('Token has no subject');
    return payload.sub;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError('Invalid or expired token');
  }
}
