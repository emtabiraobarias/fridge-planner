import 'server-only';
import { z } from 'zod';
import { Account } from '../models/account';
import { identityProvider, IdentityProviderError } from '../services/identity-provider';
import { problem, type ControllerResult } from '../http';

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
