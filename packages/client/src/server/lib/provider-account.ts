import 'server-only';
import { Account } from '../models/account';
import { identityProvider } from '../services/identity-provider';
import { asAccountId } from './account-id';

/**
 * Keep the identity provider's account in step with an erasure (spec 013 FR-AC-039/040/041).
 *
 * Without this, deletion is app-only: the provider knows nothing about the erasure, so the
 * person authenticates successfully, receives a brand-new valid token, and meets a 401 on
 * every request — signed in and locked out at the same time.
 *
 * Called from BOTH the self-service and administrator erasure paths. Wiring it into only one
 * would leave the other app-only, which is the exact hole the requirement names.
 */

/**
 * Every provider subject that resolves to this account.
 *
 * Empty for an identity that cannot be an account id — a pre-migration provider subject, or a
 * dev-seam id. Those have no `accounts` row and therefore no provider identity to act on, and
 * `asAccountId` is what stops the lookup THROWING instead of saying so.
 */
export async function subjectsFor(userId: string): Promise<string[]> {
  const id = asAccountId(userId);
  if (!id) return [];
  const account = await Account.findById(id).select({ identities: 1 }).lean();
  return (account?.identities ?? []).map((i) => i.subject);
}

/**
 * Apply a provider operation to every linked identity, never throwing.
 *
 * NEVER THROWING is the decision here. The user asked to be deleted, and a provider outage
 * must not leave them un-erased in the app as well — the app-side refusal in `authenticate()`
 * is what actually stops access, and the provider can be reconciled by re-running the purge.
 * The failure is logged because an operator needs to know a provider account is out of step.
 *
 * Every linked identity, not just the first: after US4 an account answers to several pairs,
 * and suspending one would leave the others able to obtain fresh tokens for an erased account.
 */
async function applyToAll(
  subjects: string[],
  operation: 'suspend' | 'resume' | 'deleteUser',
): Promise<void> {
  for (const subject of subjects) {
    try {
      await identityProvider()[operation](subject);
    } catch (err) {
      console.error(`[provider-account] ${operation} failed`, { subject, err });
    }
  }
}

/** FR-AC-039 — disabled, NOT deleted: the recovery window has to be reversible. */
export async function suspendProviderAccount(userId: string): Promise<void> {
  await applyToAll(await subjectsFor(userId), 'suspend');
}

/** FR-AC-040 — the exact inverse, for a restore inside the window. */
export async function resumeProviderAccount(userId: string): Promise<void> {
  await applyToAll(await subjectsFor(userId), 'resume');
}

/**
 * FR-AC-041 — destroy the provider account at purge.
 *
 * ⚠️ Takes subjects rather than a userId, and that signature is load-bearing. `purgeUserData`
 * deletes the `accounts` document, which is the ONLY place the provider subjects are
 * recorded — so they must be read BEFORE the purge. Given a userId, this function would
 * silently find nothing and the provider account would survive forever.
 */
export async function deleteProviderAccount(subjects: string[]): Promise<void> {
  await applyToAll(subjects, 'deleteUser');
}
