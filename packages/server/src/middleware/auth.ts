import type { Request, Response, NextFunction } from 'express';
import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { AuthError } from '../lib/auth-errors.js';

// Spec 002 / Phase D: validate an OIDC Bearer JWT and set req.userId from the `sub`
// claim. Two modes (FR-D-007): dev (trust X-User-Id — local dev + tests) and oidc
// (verify signature via JWKS + iss/aud/exp). Production requires oidc (FR-D-008).

declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}

// Cached JWKS resolver (also the test-injection seam — set `globalThis._authJwks`).
const globalForJwks = globalThis as unknown as { _authJwks?: JWTVerifyGetKey };
function jwks(): JWTVerifyGetKey {
  if (!globalForJwks._authJwks) {
    const uri = process.env['AUTH_JWKS_URI'];
    if (!uri) throw new AuthError('Authentication is not configured');
    globalForJwks._authJwks = createRemoteJWKSet(new URL(uri));
  }
  return globalForJwks._authJwks;
}

function resolveMode(): 'dev' | 'oidc' {
  const mode = process.env['AUTH_MODE'] ?? (process.env['NODE_ENV'] === 'production' ? 'oidc' : 'dev');
  // Dev seam must never be an accidental production auth path (FR-D-008); a test/CI
  // boot may opt in explicitly with AUTH_ALLOW_DEV=true (two deliberate flags).
  if (
    process.env['NODE_ENV'] === 'production' &&
    mode !== 'oidc' &&
    process.env['AUTH_ALLOW_DEV'] !== 'true'
  ) {
    throw new Error('AUTH_MODE must be "oidc" in production — the dev auth seam is disabled (set AUTH_ALLOW_DEV=true only for E2E/CI test boots)');
  }
  return mode === 'oidc' ? 'oidc' : 'dev';
}

function bearerToken(req: Request): string | null {
  const header = (req.headers['authorization'] as string | undefined) ?? '';
  const match = /^Bearer (.+)$/i.exec(header);
  return match?.[1] ?? null;
}

async function resolveUserId(req: Request): Promise<void> {
  if (resolveMode() === 'dev') {
    req.userId = (req.headers['x-user-id'] as string | undefined) ?? 'anonymous';
    return;
  }

  const token = bearerToken(req);
  if (!token) throw new AuthError('Missing bearer token');

  const options: { issuer?: string; audience?: string; clockTolerance: number } = { clockTolerance: 5 };
  const issuer = process.env['AUTH_ISSUER'];
  const audience = process.env['AUTH_AUDIENCE'];
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;

  try {
    const { payload } = await jwtVerify(token, jwks(), options);
    if (!payload.sub) throw new AuthError('Token has no subject');
    req.userId = payload.sub;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError('Invalid or expired token');
  }
}

// Async work is forwarded to next() manually — Express 4 doesn't catch async throws.
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  void resolveUserId(req).then(
    () => next(),
    (err: unknown) => next(err),
  );
}
