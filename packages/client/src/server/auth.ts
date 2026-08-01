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
  const mode =
    process.env['AUTH_MODE'] ?? (process.env['NODE_ENV'] === 'production' ? 'oidc' : 'dev');
  // FR-D-007/FR-D-008: the dev seam must never be an *accidental* production auth path.
  // A production build (e.g. `next start` in the E2E gate) sets NODE_ENV=production, so the
  // seam additionally requires an explicit AUTH_ALLOW_DEV=true acknowledgment — two
  // deliberate flags, never reachable by misconfiguration of a real deployment.
  if (
    process.env['NODE_ENV'] === 'production' &&
    mode !== 'oidc' &&
    process.env['AUTH_ALLOW_DEV'] !== 'true'
  ) {
    throw new Error(
      'AUTH_MODE must be "oidc" in production — the dev auth seam is disabled (set AUTH_ALLOW_DEV=true only for E2E/CI test boots)',
    );
  }
  return mode === 'oidc' ? 'oidc' : 'dev';
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/i.exec(header);
  return match?.[1] ?? null;
}

// ——— spec 011: authorization (FR-AD-001..006, research D1/D2) ———
//
// `authenticate()` answers *who you are*; `authenticatePrincipal()` additionally
// answers *what you may do*. The principal is derived from the SAME single token
// verification — roles are a claim read, not a second round trip.

/** An authenticated caller: identity plus the roles their verified token carries. */
export interface Principal {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly isAdmin: boolean;
}

/** The role name that grants administration (FR-AD-001). */
function adminRole(): string {
  return process.env['AUTH_ADMIN_ROLE'] ?? 'admin';
}

/**
 * Read the role array out of a verified JWT payload at a configurable dotted path
 * (`AUTH_ROLES_CLAIM`, default Keycloak's `realm_access.roles`).
 *
 * Never throws: a missing or malformed claim means "no roles", not a broken
 * request — throwing here would surface an unauthorized caller as a 500 instead
 * of the clean 403 FR-AD-003 requires. Exported for direct unit testing.
 */
export function rolesFromPayload(payload: unknown): string[] {
  const path = (process.env['AUTH_ROLES_CLAIM'] ?? 'realm_access.roles').split('.');
  let node: unknown = payload;
  for (const key of path) {
    if (typeof node !== 'object' || node === null) return [];
    node = (node as Record<string, unknown>)[key];
  }
  if (!Array.isArray(node)) return [];
  return node.every((r) => typeof r === 'string') ? (node as string[]) : [];
}

function principal(userId: string, roles: string[]): Principal {
  return { userId, roles, isAdmin: roles.includes(adminRole()) };
}

/**
 * Resolve the authenticated principal (identity + roles) for a request, or throw
 * AuthError (→ 401).
 *
 * The dev seam reads roles from `X-User-Roles` — reachable ONLY on the `dev`
 * branch of `resolveMode()`, which already throws in production unless the
 * deliberate two-flag `AUTH_ALLOW_DEV=true` acknowledgment is present. FR-AD-004
 * is therefore *inherited* from that existing guard rather than re-implemented as
 * a second check that could drift out of agreement with it.
 */
export async function authenticatePrincipal(request: Request): Promise<Principal> {
  if (resolveMode() === 'dev') {
    // The header is the seam tests and scripts use. A BROWSER cannot set it, so local
    // manual testing would otherwise always be an unprivileged `anonymous` — unable to
    // reach any admin screen. `AUTH_DEV_ROLES` supplies a default for that case only.
    // It is read on this branch alone, so it inherits resolveMode()'s two-flag
    // production refusal exactly as the identity header does (FR-AD-004): it cannot
    // grant anything in production, where this code path is unreachable.
    const header = request.headers.get('x-user-roles');
    const source = header ?? process.env['AUTH_DEV_ROLES'] ?? '';
    const roles = source
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    const userId =
      request.headers.get('x-user-id') ?? process.env['AUTH_DEV_USER_ID'] ?? 'anonymous';
    return principal(userId, roles);
  }

  const token = bearerToken(request);
  if (!token) throw new AuthError('Missing bearer token');

  // Build options without `undefined` (exactOptionalPropertyTypes).
  const options: { issuer?: string; audience?: string; clockTolerance: number } = {
    clockTolerance: 5,
  };
  const issuer = process.env['AUTH_ISSUER'];
  const audience = process.env['AUTH_AUDIENCE'];
  if (issuer) options.issuer = issuer;
  if (audience) options.audience = audience;

  try {
    const { payload } = await jwtVerify(token, jwks(), options);
    if (!payload.sub) throw new AuthError('Token has no subject');
    return principal(payload.sub, rolesFromPayload(payload));
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError('Invalid or expired token');
  }
}

/**
 * Resolve the authenticated user id for a request, or throw AuthError (→ 401).
 * Replaces the old `getUserId` X-User-Id stub. Identity flows unchanged into the
 * controllers, which scope every query by userId (FR-036).
 *
 * Deliberately still returns a bare `string`: 23 route files call this, and
 * widening the return type would turn a two-line authorization change into a
 * 23-file refactor (research D1). Handlers opt into roles by calling
 * `authenticatePrincipal()` instead.
 */
export async function authenticate(request: Request): Promise<string> {
  return (await authenticatePrincipal(request)).userId;
}
