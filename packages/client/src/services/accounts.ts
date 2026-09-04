/**
 * Browser calls for the signed-out account surface (spec 013 US1).
 *
 * Deliberately does NOT use `apiFetch`/`ensureOk` like every other service module. Those
 * exist for authenticated calls: `apiFetch` retries a 401 through the refresh grant, and
 * `ensureOk` broadcasts a 401 to `AuthBanner` as "your session expired". Neither is true
 * here — the caller has no session and is not supposed to. Routing registration through
 * them would pop a re-authentication prompt at someone in the middle of creating their
 * first account.
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
