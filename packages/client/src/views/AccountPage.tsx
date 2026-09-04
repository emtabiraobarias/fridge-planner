'use client';
import { LogIn } from 'lucide-react';
import { AccountPanel } from '../components/account/AccountPanel';
import { RegisterForm } from '../components/account/RegisterForm';
import { useAuth } from '../context/AuthContext';
import { useMe } from '../hooks/useMe';

/**
 * The account surface (spec 013).
 *
 * ⚠️ Reached from Home and the desktop sidebar footer, and **NOT** a navigation destination
 * (FR-AC-028, inheriting `002` FR-D-017). That navigation is a four-item layout tuned across
 * five viewport classes and has already shipped clipping defects under exactly this pressure;
 * a fifth item would re-enter that fight for a page people visit twice a year.
 *
 * The signed-out half is the load-bearing part. Every other route in this app assumes a
 * session, so an entry point that only works once you have one is the easy accident — and
 * the whole point of self-registration is that the person using it does not have an account
 * yet (FR-AC-029).
 */
function SignedOutAccount(): React.JSX.Element {
  const { login } = useAuth();
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h2 className="text-h5 font-semibold text-ink">Create an account</h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          Your kitchen, meal plans and grocery list, kept between visits.
        </p>
        <RegisterForm />
      </section>

      <section className="flex flex-col gap-2 rounded-[16px] bg-surface px-4 py-4">
        <h2 className="text-h5 font-semibold text-ink">Already have one?</h2>
        <button
          type="button"
          onClick={login}
          className="flex items-center justify-center gap-2 rounded-full bg-accent-100 px-4 py-2 text-[14px] font-semibold text-accent-800 hover:bg-accent-200"
        >
          <LogIn aria-hidden className="h-4 w-4" />
          Sign in
        </button>

        {/* FR-AC-022/023: the provider hosts the reset form and sends its own mail. This is a
            link into that flow, not a form — the app never sees a password or a reset token
            (FR-AC-033), so there is nothing here for it to leak or get wrong. */}
        <a
          href="/account/password-reset"
          data-testid="password-reset-link"
          className="text-center text-sm font-semibold text-accent-800 underline"
        >
          Forgotten your password?
        </a>
      </section>
    </div>
  );
}

export function AccountPage(): React.JSX.Element {
  const me = useMe();
  const { isAuthenticated } = useAuth();

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 p-4">
      <h1 className="text-h4 font-bold text-ink">Account</h1>

      {/* Signed-in state comes from the SERVER's answer in preference to the client's token,
          for the reason AccountPanel documents: under the dev seam the browser holds no OIDC
          token at all, yet the server knows exactly who the caller is. */}
      {me ? <AccountPanel variant="row" /> : isAuthenticated ? null : <SignedOutAccount />}
    </div>
  );
}
