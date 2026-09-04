'use client';
import Link from 'next/link';
import { LogOut, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMe } from '../../hooks/useMe';
import type { Me } from '../../services/admin';

interface AccountPanelProps {
  /** `compact` is the desktop sidebar footer; `row` is the Home surface. */
  variant?: 'row' | 'compact';
}

const ROW_CLASS = 'flex flex-wrap items-center gap-3 rounded-[16px] bg-surface px-4 py-3';
const COMPACT_CLASS = 'flex flex-col gap-2 border-t border-accent-100 px-3 py-3';

/** The signed-in surface: identity, an admin marker, and the way out. */
function SignedIn({ me, variant }: { me: Me; variant: 'row' | 'compact' }): React.JSX.Element {
  const { logout } = useAuth();
  return (
    <div className={variant === 'compact' ? COMPACT_CLASS : ROW_CLASS} data-testid="account-panel">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] text-ink" data-testid="account-identity">
          Signed in as <span className="font-semibold">{me.userId}</span>
        </p>
      </div>

      {me.isAdmin && (
        <span
          className="rounded-full bg-accent-100 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-accent-800"
          data-testid="account-admin-badge"
        >
          Admin
        </span>
      )}

      {/* No confirmation (FR-D-015): sign-out is reversible and cheap, so a dialog would
          add friction to the very action being made available. Deliberately unlike
          spec 003 FR-F-020's confirmable — and irreversible — delete. */}
      <button
        type="button"
        onClick={logout}
        className="flex shrink-0 items-center gap-2 rounded-full bg-accent-100 px-4 py-2 text-[13px] font-semibold text-accent-800 hover:bg-accent-200"
      >
        <LogOut aria-hidden className="h-4 w-4" />
        Sign out
      </button>
    </div>
  );
}

/**
 * Who you are signed in as, and how to stop being them (spec 002 US4 —
 * FR-D-012/013/015).
 *
 * Mounted twice — on Home and in the desktop sidebar footer — and deliberately **not**
 * as a fifth navigation destination (FR-D-017: that navigation is a four-item layout
 * tuned across five viewport classes and has already shipped clipping defects under
 * exactly this pressure), nor as a second floating affordance, which would re-enter the
 * geometry fight the feedback bubble already documents.
 */
export function AccountPanel({ variant = 'row' }: AccountPanelProps): React.JSX.Element | null {
  const { isAuthenticated, login } = useAuth();
  const me = useMe();

  // Signed-in state is taken from the SERVER's answer (`/api/v1/me`) in preference to
  // the client's token, because the two can legitimately disagree: under the dev auth
  // seam the browser holds no OIDC token at all, yet the server knows exactly who the
  // caller is. Keying off the token alone rendered a permanent "Sign in" for an
  // already-identified user in local dev and the E2E gate — found by the browser test,
  // not by reasoning about it.
  //
  //   me present         → signed in (identity + sign out)
  //   no me, has a token → identity still loading; render nothing rather than flash
  //                        the wrong state (or an Admin badge at an ordinary user)
  //   neither            → signed out
  if (me) return <SignedIn me={me} variant={variant} />;
  if (isAuthenticated) return null;

  // FR-D-013: a signed-out user gets a sign-in action WITHOUT having to provoke a
  // failed request first. AuthBanner's post-401 prompt (FR-D-009) is unchanged; it is
  // simply no longer the only route in.
  //
  // Spec 013 FR-AC-029 extends the same reasoning to registration: this panel is mounted on
  // Home and in the sidebar footer, so it is the ONLY place a person with no account can be
  // handed one. Without the second link, `/account` would exist and be unreachable by
  // exactly the people it is for.
  return (
    <div
      className={
        variant === 'compact' ? 'flex flex-col gap-2 px-3 py-2' : `${ROW_CLASS} gap-2`
      }
      data-testid="account-panel"
    >
      <button
        type="button"
        onClick={login}
        className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-bg hover:bg-accent-600"
      >
        <LogIn aria-hidden className="h-4 w-4" />
        Sign in
      </button>
      <Link
        href="/account"
        data-testid="account-register-link"
        className="flex items-center gap-2 rounded-full bg-accent-100 px-4 py-2 text-[13px] font-semibold text-accent-800 hover:bg-accent-200"
      >
        <UserPlus aria-hidden className="h-4 w-4" />
        Create account
      </Link>
    </div>
  );
}
