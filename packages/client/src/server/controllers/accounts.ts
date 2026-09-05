import 'server-only';
import { z } from 'zod';
import { Account } from '../models/account';
import { identityProvider, IdentityProviderError } from '../services/identity-provider';
import { problem, type ControllerResult } from '../http';
import type { Principal } from '../auth';
import { asAccountId } from '../lib/account-id';

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
 * See `lib/account-id.ts` for why the narrowing exists at all: `findById` THROWS on a
 * non-ObjectId rather than returning null, and non-ObjectId identities are ordinary here.
 */
const NO_ACCOUNT = problem(404, 'Not Found', 'No account record exists for this identity.');

function accountIdOf(principal: Principal): string | null {
  return asAccountId(principal.userId);
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

// ——— US3: export and delete your own data ———

/**
 * FR-AC-024. The SAME shape `011`'s administrator export produces, not a second format:
 * one export means one thing to keep correct when a collection is added.
 */
export async function exportOwn(principal: Principal): Promise<ControllerResult> {
  const id = accountIdOf(principal);
  if (!id) return NO_ACCOUNT;

  const { collectUserData, ALL_USER_DATA_MODELS } = await import('../lib/account-purge');
  const { record: auditRecord } = await import('../lib/audit');

  const data = await collectUserData(id);
  // FR-AC-027. Actor and subject are the same person here — that is what makes it a
  // SELF-export, and why the action name says so rather than reusing `user.export`.
  await auditRecord(id, 'account.self-export', { userId: id, type: 'account' });

  return {
    status: 200,
    body: {
      userId: id,
      exportedAt: new Date().toISOString(),
      // Derived from the model list, so the manifest cannot disagree with the contents.
      collections: ALL_USER_DATA_MODELS.map((m) => m.name),
      data,
    },
  };
}

/**
 * FR-AC-025: delete your own account, through `011`'s two-phase erasure.
 *
 * Deliberately NOT a second deletion mechanism. A parallel path would mean two things to
 * reconcile at purge, two recovery windows, and two places to get the access refusal wrong.
 * The account becomes inaccessible immediately — enforced in `authenticate()`, so no
 * controller can forget it — and the data is purged only after the window.
 */
export async function deleteOwn(principal: Principal): Promise<ControllerResult> {
  const id = accountIdOf(principal);
  if (!id) return NO_ACCOUNT;

  // FR-AC-026. Roles live in the identity provider, so the app cannot enumerate
  // administrators and cannot literally know whether one would be left. The check it CAN make
  // correctly is the one `011` FR-AD-020 already makes for the administrator path: an
  // administrator may not delete themselves. Refusing is the safe side of an unknowable
  // question — an administrator who genuinely wants to leave can have another one erase them.
  if (principal.isAdmin) {
    return problem(
      409,
      'Cannot Delete Administrator',
      'An administrator cannot delete their own account — it would risk leaving the system unadministrable. Ask another administrator to remove it.',
    );
  }

  const { AccountErasure } = await import('../models/account-erasure');
  const { ERASURE_WINDOW_DAYS } = await import('../types/admin');
  const { suspendProviderAccount } = await import('../lib/provider-account');
  const { record: auditRecord } = await import('../lib/audit');

  const erasedAt = new Date();
  const purgeAfter = new Date(erasedAt.getTime() + ERASURE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  await AccountErasure.findOneAndUpdate(
    { userId: id },
    { $set: { erasedAt, purgeAfter, erasedBy: id }, $unset: { restoredAt: '' } },
    { upsert: true },
  );

  await suspendProviderAccount(id); // FR-AC-039
  await auditRecord(id, 'account.self-delete', { userId: id, type: 'account' });

  return {
    status: 202,
    body: { userId: id, erasedAt, purgeAfter, recoverableForDays: ERASURE_WINDOW_DAYS },
  };
}

