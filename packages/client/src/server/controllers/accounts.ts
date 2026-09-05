import 'server-only';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Account } from '../models/account';
import { identityProvider, IdentityProviderError } from '../services/identity-provider';
import { problem, type ControllerResult } from '../http';
import type { Principal } from '../auth';

/**
 * Self-service account operations (spec 013 US1).
 *
 * The provider owns credentials, verification mail and reset flows; this layer owns the
 * `accounts` document and the app's contract with the caller. Nothing here handles a password
 * beyond passing it straight to the adapter (FR-AC-033).
 */

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(512),
  displayName: z.string().trim().min(1).max(100),
});

/**
 * FR-AC-016: refuse a duplicate WITHOUT confirming the address exists.
 *
 * One message for both the "we already have this account" and the "the provider already has
 * this user" paths, because two differently-worded refusals are still an enumeration oracle:
 * anyone could discover who has an account here by submitting addresses and reading which
 * sentence comes back.
 */
const NON_DISCLOSING_CONFLICT = problem(
  409,
  'Registration Unavailable',
  'We could not complete registration with those details. If you have an account, try signing in or resetting your password.',
);

export async function register(body: unknown, issuer: string): Promise<ControllerResult> {
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, 'Invalid Request', 'Provide a valid email, password and display name.');
  }
  const email = parsed.data.email.toLowerCase();

  if (await Account.exists({ email })) return NON_DISCLOSING_CONFLICT;

  // The PROVIDER user is created first, deliberately. Written the other way round, a provider
  // outage would strand `accounts` rows that nobody can ever sign in to — and whose addresses
  // then block the owner from re-registering.
  let subject: string;
  try {
    subject = await identityProvider().createUser({
      email,
      password: parsed.data.password,
      displayName: parsed.data.displayName,
    });
  } catch (err) {
    return registrationFailure(err);
  }

  try {
    const account = await Account.create({
      email,
      displayName: parsed.data.displayName,
      identities: [{ issuer, subject, linkedAt: new Date() }],
      // FR-AC-014. The refusal lives in `authenticate()` rather than here, because a session
      // is established on every request, not once at registration.
      pendingVerification: true,
    });

    // FR-AC-013. After the account exists: a verification mail for an account we then failed
    // to write would send someone to confirm an address that leads nowhere.
    await identityProvider().sendVerification(subject);
    return { status: 201, body: { accountId: account._id.toString() } };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return NON_DISCLOSING_CONFLICT;
    throw err;
  }
}

/**
 * Turn an adapter failure into a response.
 *
 * Split on what the caller can do about it. A 409 is a duplicate and must stay non-disclosing.
 * Any other 4xx is the provider judging the input — its stated reason is the only thing that
 * tells someone why their password was refused (FR-AC-017). A 5xx is the provider failing:
 * rethrown so `withRoute` logs it and answers a generic 500, because its internals say nothing
 * a user can act on and describe the deployment's shape.
 */
function registrationFailure(err: unknown): ControllerResult {
  if (!(err instanceof IdentityProviderError)) throw err;
  if (err.status === 409) return NON_DISCLOSING_CONFLICT;
  if (err.userFacing) return problem(400, 'Registration Rejected', err.message);
  throw err;
}

// ——— US2: manage your own account ———

/** FR-AC-021. Bounded so a display name stays a name and not a payload. */
const displayNameSchema = z.object({ displayName: z.string().trim().min(1).max(100) });

/**
 * No account exists for this identity — and a 404 rather than a throw.
 *
 * `findById` does not return null for a non-ObjectId, it THROWS a CastError, which
 * `withRoute` would turn into a 500. Identities that are not ObjectIds are ordinary here: the
 * dev seam issues `anonymous` and whatever `x-user-id` a test sends, and every identity is a
 * provider subject until the migration runs. Same trap as `account-purge.ts`'s `scope()`,
 * found the same way — by an e2e, not by reasoning about it.
 */
const NO_ACCOUNT = problem(404, 'Not Found', 'No account record exists for this identity.');

function accountIdOf(principal: Principal): string | null {
  return mongoose.isValidObjectId(principal.userId) ? principal.userId : null;
}

export async function getMe(principal: Principal): Promise<ControllerResult> {
  const id = accountIdOf(principal);
  if (!id) return NO_ACCOUNT;
  const account = await Account.findById(id)
    .select({ email: 1, displayName: 1 })
    .lean();
  // The caller IS authenticated, so 401 would be wrong and would trip the client's
  // refresh-and-retry (FR-D-010) into a loop. But answering 200 with empty fields would let
  // the UI render a blank profile as though it were real.
  if (!account) return NO_ACCOUNT;
  return {
    status: 200,
    body: {
      accountId: principal.userId,
      email: account.email ?? null,
      displayName: account.displayName,
      isAdmin: principal.isAdmin,
    },
  };
}

export async function updateDisplayName(
  principal: Principal,
  body: unknown,
): Promise<ControllerResult> {
  const parsed = displayNameSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, 'Invalid Request', 'Provide a display name of 1 to 100 characters.');
  }

  // Scoped to the CALLER, and only `displayName` is written. Taking the target from the body
  // would be a display-name account takeover; accepting `email` from it would let someone
  // re-point the address FR-AC-008 matches on to one they have not proved they own
  // (FR-AC-034 refreshes it from the verified claim instead).
  const id = accountIdOf(principal);
  if (!id) return NO_ACCOUNT;

  const updated = await Account.findByIdAndUpdate(
    id,
    { $set: { displayName: parsed.data.displayName } },
    { new: true },
  )
    .select({ displayName: 1 })
    .lean();

  if (!updated) return NO_ACCOUNT;
  return {
    status: 200,
    body: { accountId: principal.userId, displayName: updated.displayName },
  };
}

/**
 * FR-AC-022/023: ask the provider to run its own reset, and answer the same way every time.
 *
 * ALWAYS 202 with an empty body. Any observable difference — status, body, or an error that
 * only a registered address can provoke — turns a signed-out endpoint that takes an email
 * address into an account-enumeration oracle. That includes the failure path: a 502 when the
 * provider is down would say "this address exists and something went wrong for it".
 *
 * The app sees no token and no password at any point (FR-AC-033). It asks; the provider mails,
 * hosts the form, and enforces expiry, single use and replay.
 */
export async function requestPasswordReset(body: unknown): Promise<ControllerResult> {
  const email = extractEmail(body);
  if (email) {
    const account = await Account.findOne({ email }).select({ identities: 1 }).lean();
    const subject = account?.identities[0]?.subject;
    if (subject) {
      try {
        await identityProvider().initiatePasswordReset(subject);
      } catch (err) {
        // Logged, never surfaced: the operator needs to know the provider is failing, and the
        // caller must not be able to tell this attempt differed from any other.
        console.error('[accounts] password reset could not be initiated', err);
      }
    }
  }
  return { status: 202, body: null };
}

/** Lowercased, or undefined for anything that cannot be an address at all. */
function extractEmail(body: unknown): string | undefined {
  const parsed = z.object({ email: z.string().trim().email().max(254) }).safeParse(body);
  return parsed.success ? parsed.data.email.toLowerCase() : undefined;
}
