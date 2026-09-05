import { apiFetch, ensureOk } from './http';

/**
 * Browser calls for the account surface (spec 013).
 *
 * ⚠️ This module is split down the middle, and the split is deliberate.
 *
 * The SIGNED-OUT calls — registration and password reset — use plain `fetch`. Every other
 * service module in this app uses `apiFetch`/`ensureOk`, which exist for authenticated
 * callers: one retries a 401 through the refresh grant, the other broadcasts it to
 * `AuthBanner` as "your session expired". Neither is true for someone with no session, and
 * routing these through them pops a re-authentication prompt at a person in the middle of
 * creating their first account — or at someone requesting a reset precisely BECAUSE they
 * cannot sign in.
 *
 * The SIGNED-IN calls — the profile read and display-name write — use `apiFetch`/`ensureOk`
 * like everything else, because there a 401 genuinely does mean the session expired.
 */

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

/** A refusal we can show the person, taken from the server's Problem JSON detail. */
export class RegistrationError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'RegistrationError';
    this.status = status;
  }
}

async function problemDetail(res: Response, fallback: string): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  if (typeof body === 'object' && body !== null) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim() !== '') return detail;
  }
  return fallback;
}

export async function registerAccount(input: RegisterInput): Promise<{ accountId: string }> {
  const res = await fetch('/api/v1/accounts/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    // The server has already decided what is safe to say — a 409 is deliberately
    // non-disclosing (FR-AC-016) and a 400 carries the provider's stated password reason
    // (FR-AC-017). Showing its `detail` verbatim is the point; rewording it here would
    // either leak what the server withheld or discard what it chose to pass on.
    throw new RegistrationError(
      await problemDetail(res, 'Registration could not be completed. Try again.'),
      res.status,
    );
  }
  return (await res.json()) as { accountId: string };
}

// ——— US2: the signed-in half ———
//
// These DO go through `apiFetch`: the caller has a session, so a 401 genuinely means it
// expired and the refresh-and-retry (FR-D-010) is exactly the right behaviour.

export interface AccountProfile {
  accountId: string;
  email: string | null;
  displayName: string;
  isAdmin: boolean;
}

export async function fetchAccountProfile(): Promise<AccountProfile> {
  const res = await apiFetch('/api/v1/accounts/me');
  return (await ensureOk(res, 'load your account').json()) as AccountProfile;
}

export async function updateDisplayName(displayName: string): Promise<void> {
  const res = await apiFetch('/api/v1/accounts/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  ensureOk(res, 'update your display name');
}

/**
 * FR-AC-023: the server answers 202 whether or not the address is registered, so there is
 * nothing here to branch on — and nothing this function could tell a caller that would not
 * re-create the enumeration oracle the endpoint exists to avoid.
 *
 * Signed-out reachable, so plain `fetch` like `registerAccount` above: routing it through
 * `apiFetch`/`ensureOk` would pop a re-authentication prompt at someone who cannot sign in,
 * which is the entire audience for a password reset.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await fetch('/api/v1/accounts/password-reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function exportOwnData(): Promise<unknown> {
  const res = await apiFetch('/api/v1/accounts/me/export');
  return ensureOk(res, 'export your data').json();
}

/**
 * FR-AC-025. Resolves on 202 — the account is SCHEDULED for deletion, not deleted, and the
 * caller gets the recovery window back so the UI can say how long it has.
 */
export interface DeletionScheduled {
  purgeAfter: string;
  recoverableForDays: number;
}

export async function deleteOwnAccount(): Promise<DeletionScheduled> {
  const res = await apiFetch('/api/v1/accounts/me', { method: 'DELETE' });
  if (res.status === 409) {
    // The administrator refusal (FR-AC-026). Its `detail` explains what to do instead, so it
    // is shown verbatim rather than replaced with a generic failure.
    throw new RegistrationError(
      await problemDetail(res, 'This account cannot be deleted.'),
      res.status,
    );
  }
  return (await ensureOk(res, 'delete your account').json()) as DeletionScheduled;
}

