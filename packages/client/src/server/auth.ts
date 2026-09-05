import 'server-only';
import mongoose from 'mongoose';
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
/**
 * The dev-seam principal. Headers are what tests and scripts drive; the `AUTH_DEV_*`
 * env vars exist only because a BROWSER cannot set headers, which would otherwise make
 * every admin screen unreachable in local manual testing.
 *
 * An explicit header always wins over the env — including an empty one — so a refusal
 * test can still drive an ordinary user on a machine whose env defaults to admin.
 *
 * Reached only from the `dev` branch below, so it inherits resolveMode()'s two-flag
 * production refusal (FR-AD-004) rather than re-checking it.
 */
function devPrincipal(request: Request): Principal {
  const idHeader = request.headers.get('x-user-id');
  const rolesHeader = request.headers.get('x-user-roles');

  // The env defaults apply ONLY to a request that identifies itself with no headers at
  // all — i.e. a browser, the single case they exist for. Any caller that sends
  // `x-user-id` is being explicit about who it is, so its roles come from the header
  // alone and default to none.
  //
  // This narrowness is load-bearing, not tidiness: `.env.local` is loaded by
  // `next start` as well as `next dev`, so a broader fallback silently promoted every
  // header-identified E2E request to administrator and turned the suite's refusal
  // assertions green for the wrong reason. Discovered exactly that way.
  const isHeaderIdentified = idHeader !== null;
  const rolesSource =
    rolesHeader ?? (isHeaderIdentified ? '' : (process.env['AUTH_DEV_ROLES'] ?? ''));
  const roles = rolesSource
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  const userId = idHeader ?? process.env['AUTH_DEV_USER_ID'] ?? 'anonymous';
  return principal(userId, roles);
}

/**
 * Spec 011 FR-AD-018: an erased account is refused HERE, at the single seam every
 * authenticated request passes through — so no controller can forget it, and the
 * refusal covers the user's own access and every administrator surface at once.
 *
 * Fails OPEN on a lookup error: a database blip must not lock every user out. The
 * window this leaves is bounded and strictly better than the alternative.
 */
async function refuseIfErased(userId: string): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  try {
    const { AccountErasure } = await import('./models/account-erasure');
    const erased = await AccountErasure.findOne({ userId, restoredAt: null }).lean();
    if (erased) throw new AuthError('This account has been removed');
  } catch (err) {
    if (err instanceof AuthError) throw err;
    console.error('[auth] erasure check failed (failing open)', err);
  }
}

/**
 * Spec 013 (FR-AC-001/002/004/010): translate the provider's `(issuer, subject)` pair into
 * THE internal identifier — `accounts._id` — which is what every user-keyed document is
 * keyed by. Before this existed, `userId` *was* the provider's `sub`: a value we neither
 * own nor control, unique only within one provider, and impossible to carry to another.
 *
 * Per request, with no process-local cache (research R3). A cache would let two instances
 * disagree after an erasure or an email refresh, which is exactly the state the erasure
 * check exists to prevent (constitution VI).
 */

/** Read a string claim, treating a non-string as absent rather than coercing it. */
function claim(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * A readable name for a brand-new account. The claims are the only thing we know about the
 * person at this point; the local part of the address beats showing them a raw subject.
 */
function displayNameFrom(payload: Record<string, unknown>, email: string | undefined): string {
  return (
    claim(payload, 'name') ??
    claim(payload, 'preferred_username') ??
    claim(payload, 'given_name') ??
    email?.split('@')[0] ??
    'Account'
  );
}

async function createAccountFor(
  issuer: string,
  subject: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const { Account } = await import('./models/account');
  const claimed = claim(payload, 'email')?.toLowerCase();
  // Only a VERIFIED address is stored. Two reasons, and the second is the security one:
  // an unverified address is not evidence of anything, and storing it would put it into the
  // pool FR-AC-008 matches against — so an attacker could seed someone else's address on
  // their own account and wait for the real owner to arrive. It also removes the duplicate-key
  // case entirely, since the address that could collide is exactly the one not stored.
  const email = payload['email_verified'] === true ? claimed : undefined;
  const doc: Record<string, unknown> = {
    displayName: displayNameFrom(payload, claimed),
    identities: [{ issuer, subject, linkedAt: new Date() }],
  };
  // Omitted rather than set to undefined: the email index is sparse, and a stored null
  // would put every email-less account on the same key.
  if (email) doc['email'] = email;

  try {
    const created = await Account.create(doc);
    return created._id.toString();
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;

    // Two requests for the same brand-new user raced and both saw "no match". The loser
    // reads the winner's row — this is the case the unique index exists to force.
    const existing = await Account.findOne({
      identities: { $elemMatch: { issuer, subject } },
    })
      .select({ _id: 1 })
      .lean();
    if (existing) return existing._id.toString();

    // Not the pair, then: the ADDRESS collided, despite `linkVerifiedEmail` having already
    // declined to match it. Two requests for the same verified address raced. Fail closed —
    // the cost is a signed-in stranger seeing an error and retrying, the alternative is them
    // seeing another person's kitchen.
    throw new AuthError('This email address is already linked to another account');
  }
}

/**
 * FR-AC-034: keep the stored address in step with the provider's VERIFIED claim.
 *
 * Not a freshness nicety. The stored address is the key FR-AC-008 matches on when a new
 * issuer appears, so a stale one is a hijack route: if the real user moves on and someone
 * else later registers and verifies the abandoned address, matching would hand them the
 * original account.
 *
 * Here rather than at sign-in because the app never observes sign-in — only requests
 * carrying tokens (R6). Conditional, so the steady-state cost of running on every
 * authenticated request is a comparison rather than a write.
 */
async function refreshEmail(
  accountId: string,
  stored: string | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  // `email_verified` is the entire guarantee. Without it a signed-in user could re-point
  // their account at any address, which is the move FR-AC-009 refuses on the linking side.
  if (payload['email_verified'] !== true) return;
  const claimed = claim(payload, 'email')?.toLowerCase();
  if (!claimed || claimed === stored?.toLowerCase()) return;

  const { Account } = await import('./models/account');
  try {
    await Account.updateOne({ _id: accountId }, { $set: { email: claimed } });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    // Another account already holds the address. Surfacing this as a 401 would lock a
    // legitimate user out over a provider-side conflict they can neither see nor fix, and
    // the stale value grants nothing on its own — the account that owns the address owns it
    // already. Keep the old value and leave a trail for the operator.
    console.warn('[auth] email refresh skipped: address already in use', { accountId });
  }
}

/**
 * Repair the placeholder display name the migration had to leave behind.
 *
 * `migrate-account-identities.mjs` can only name a user by their provider subject — the old
 * data contains no name anywhere. Without this, every migrated user would look at a raw
 * subject in the account panel until they edited it by hand.
 *
 * Bounded deliberately: it fires ONLY while the stored value is still exactly the subject,
 * so it can never overwrite a name the user has chosen. That also makes it self-limiting —
 * once healed, the condition is false forever.
 */
async function healMigratedDisplayName(
  accountId: string,
  stored: string,
  subject: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (stored !== subject) return;
  const offered = claim(payload, 'name') ?? claim(payload, 'preferred_username');
  if (!offered || offered === subject) return;

  const { Account } = await import('./models/account');
  await Account.updateOne({ _id: accountId, displayName: subject }, { $set: { displayName: offered } });
}

/**
 * FR-AC-014/015: an account whose address is not yet verified cannot hold a session.
 *
 * The provider gates its own login too, but the app must not depend on a setting it does not
 * own — a provider misconfiguration should not become an authentication bypass here.
 *
 * `pendingVerification` is ABSENT on every account that did not register through us, so
 * accounts predating spec 013 are not gated. That is the difference between shipping this and
 * locking out every existing user on deploy day.
 *
 * The message names the outstanding step (FR-AC-015) because a bare "unauthorized" sends
 * someone off to reset a password that is perfectly fine.
 */
function refuseIfUnverified(
  pending: boolean | undefined,
  payload: Record<string, unknown>,
): void {
  if (pending !== true) return;
  if (payload['email_verified'] === true) return;
  throw new AuthError(
    'Your email address is not verified yet. Check your inbox for the verification link we sent.',
  );
}

/**
 * Clear the gate once the provider says the address is verified.
 *
 * Guarded on the flag still being set, so this is one comparison per request in the steady
 * state rather than a write.
 */
async function clearPendingVerification(
  accountId: string,
  pending: boolean | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  if (pending !== true || payload['email_verified'] !== true) return;
  const { Account } = await import('./models/account');
  await Account.updateOne({ _id: accountId }, { $unset: { pendingVerification: '' } });
}

/**
 * FR-AC-008: an unrecorded `(issuer, subject)` pair carrying a VERIFIED email that matches a
 * stored address resolves to the EXISTING account. This is what makes a provider change a
 * configuration change instead of a data migration.
 *
 * ⚠️ The refusal is the load-bearing half (FR-AC-009). Matching on an address the new provider
 * has not verified would let anyone who registers with someone else's email inherit that
 * person's inventory, meal plans and feedback. `email_verified === true` — strictly, because
 * providers have spelled it `"true"` before and a loose check turns the barrier into
 * decoration.
 *
 * Returns null when it declines, leaving the caller to create a fresh account (FR-AC-010).
 */
async function linkVerifiedEmail(
  issuer: string,
  subject: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  if (payload['email_verified'] !== true) return null;
  const email = claim(payload, 'email')?.toLowerCase();
  if (!email) return null;

  const { Account } = await import('./models/account');
  // Guarded update rather than read-then-write: the filter re-checks that this pair is still
  // absent, so two concurrent first sign-ins through a new provider cannot both append it.
  const linkedAt = new Date();
  const account = await Account.findOneAndUpdate(
    { email, 'identities.subject': { $ne: subject } },
    { $push: { identities: { issuer, subject, linkedAt } } },
    { new: true },
  )
    .select({ _id: 1 })
    .lean();

  if (!account) {
    // Either no account holds the address, or this pair is already recorded on it — the
    // latter meaning a concurrent request won the race, which resolution handles on retry.
    const already = await Account.findOne({ email, 'identities.subject': subject })
      .select({ _id: 1 })
      .lean();
    return already ? already._id.toString() : null;
  }

  const id = account._id.toString();
  // FR-AC-011. A link silently re-points one person's whole history at a new provider
  // identity; if it ever happens wrongly, this entry is the only way anyone finds out.
  // Recorded ONLY on an actual link — not on a refusal, which would read as though the
  // attacker had succeeded, and not on ordinary sign-ins, which run on every request and
  // would bury the real links.
  const { record: auditRecord } = await import('./lib/audit');
  await auditRecord(id, 'account.identity-link', { userId: id, type: 'account' });
  return id;
}

async function resolveInternalId(
  issuer: string,
  subject: string,
  payload: Record<string, unknown>,
): Promise<string> {
  // Fail CLOSED, deliberately unlike `refuseIfErased` below. That one fails open because the
  // worst case is a brief window where an erased account still reads. Here the fallback would
  // be returning the provider subject as a userId — writing documents under a key FR-AC-002
  // forbids, which no later migration can reliably untangle. Every route calls connectDb()
  // before authenticating, so a request arriving here without a connection was already lost.
  if (mongoose.connection.readyState !== 1) {
    throw new AuthError('Identity store is unavailable');
  }

  const { Account } = await import('./models/account');
  const existing = await Account.findOne({ identities: { $elemMatch: { issuer, subject } } })
    .select({ _id: 1, email: 1, displayName: 1, pendingVerification: 1 })
    .lean();
  if (existing) {
    const id = existing._id.toString();
    refuseIfUnverified(existing.pendingVerification, payload);
    await clearPendingVerification(id, existing.pendingVerification, payload);
    await refreshEmail(id, existing.email, payload);
    await healMigratedDisplayName(id, existing.displayName, subject, payload);
    return id;
  }

  const linked = await linkVerifiedEmail(issuer, subject, payload);
  if (linked) return linked;

  return createAccountFor(issuer, subject, payload);
}

export async function authenticatePrincipal(request: Request): Promise<Principal> {
  if (resolveMode() === 'dev') {
    const devP = devPrincipal(request);
    await refuseIfErased(devP.userId);
    return devP;
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

  let payload: Record<string, unknown> & { sub?: string; iss?: string };
  try {
    ({ payload } = await jwtVerify(token, jwks(), options));
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError('Invalid or expired token');
  }

  // Outside the try above on purpose: everything below is our own logic, and wrapping it
  // would relabel a resolution failure as "Invalid or expired token" — sending the user to
  // re-authenticate against a perfectly good token, forever.
  if (!payload.sub) throw new AuthError('Token has no subject');
  const tokenIssuer = payload.iss ?? issuer;
  if (!tokenIssuer) throw new AuthError('Token has no issuer');

  const userId = await resolveInternalId(tokenIssuer, payload.sub, payload);
  await refuseIfErased(userId);
  return principal(userId, rolesFromPayload(payload));
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
