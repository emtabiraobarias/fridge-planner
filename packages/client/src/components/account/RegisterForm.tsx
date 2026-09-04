'use client';
import { useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { registerAccount, RegistrationError } from '../../services/accounts';

const FIELD_CLASS =
  'w-full rounded-[12px] border border-accent-100 bg-bg px-3 py-2 text-[14px] text-ink outline-none focus:border-accent';
const LABEL_CLASS = 'block text-[13px] font-semibold text-ink';

/**
 * Self-registration (spec 013 US1, FR-AC-012).
 *
 * Three fields, because three is what the account needs. The password goes straight to the
 * server and on to the provider — the app stores none of it and validates none of it
 * (FR-AC-033). Password *policy* belongs to the provider, so this form does not second-guess
 * it: a local rule that disagreed with the realm's would reject passwords the provider would
 * have accepted, or promise ones it then refuses.
 */
export function RegisterForm(): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerAccount({ email, password, displayName });
      setRegistered(true);
    } catch (err) {
      setError(
        err instanceof RegistrationError
          ? err.message
          : 'Registration could not be completed. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (registered) {
    // NOT a signed-in state. Registration deliberately does not produce a session
    // (FR-AC-014), so a success screen that looked like sign-in would leave someone
    // clicking around a signed-out app wondering why nothing works.
    return (
      <div
        className="rounded-[16px] bg-surface px-4 py-4 text-[14px] text-ink"
        data-testid="register-verify-notice"
      >
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-sm text-muted">
          We sent a verification link to <span className="font-semibold">{email}</span>. Open it,
          then sign in — your account stays locked until the address is verified.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-[16px] bg-surface px-4 py-4"
      data-testid="register-form"
    >
      <div>
        <label className={LABEL_CLASS} htmlFor="register-email">
          Email
        </label>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          required
          className={FIELD_CLASS}
          value={email}
          onChange={(e): void => setEmail(e.target.value)}
        />
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="register-name">
          Display name
        </label>
        <input
          id="register-name"
          type="text"
          autoComplete="name"
          required
          className={FIELD_CLASS}
          value={displayName}
          onChange={(e): void => setDisplayName(e.target.value)}
        />
      </div>

      <div>
        <label className={LABEL_CLASS} htmlFor="register-password">
          Password
        </label>
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          required
          className={FIELD_CLASS}
          value={password}
          onChange={(e): void => setPassword(e.target.value)}
        />
      </div>

      {error && (
        // `role="alert"` because this is the provider's stated reason for refusing a
        // password (FR-AC-017) — the one message a person genuinely needs to read before
        // retyping it.
        <p
          role="alert"
          data-testid="register-error"
          className="rounded-lg bg-accent-100 p-3 text-sm text-accent-800"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-[14px] font-semibold text-bg hover:bg-accent-600 disabled:opacity-60"
      >
        <UserPlus aria-hidden className="h-4 w-4" />
        {submitting ? 'Creating…' : 'Create account'}
      </button>
    </form>
  );
}
