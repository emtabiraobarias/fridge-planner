'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Check, KeyRound, Download, Trash2 } from 'lucide-react';
import {
  fetchAccountProfile,
  updateDisplayName,
  requestPasswordReset,
  exportOwnData,
  deleteOwnAccount,
  type AccountProfile,
} from '../../services/accounts';

const FIELD_CLASS =
  'w-full rounded-[12px] border border-accent-100 bg-bg px-3 py-2 text-[14px] text-ink outline-none focus:border-accent';

/**
 * Export and delete, kept apart from the profile form.
 *
 * Extracted when `ProfilePanel` hit a cyclomatic complexity of 11 against this repo's limit of
 * 10 — but the split is the right shape anyway: these two act on the ACCOUNT, while the form
 * above edits fields on it.
 */
function DataControls({
  onExport,
  onDelete,
}: {
  onExport: () => Promise<void>;
  onDelete: () => Promise<void>;
}): React.JSX.Element {
  // Two-step delete, like `003` FR-F-020's record deletion: every destructive action in this
  // app is either confirmed or undoable, and this one is the largest thing a person can
  // destroy here — permanent once the recovery window closes. Inline rather than a modal; it
  // reads fine at 390px and needs no focus management.
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="flex flex-col gap-2 rounded-[16px] bg-surface px-4 py-4">
      <h3 className="text-[13px] font-semibold text-ink">Your data</h3>
      <button
        type="button"
        onClick={(): void => void onExport()}
        data-testid="export-button"
        className="flex items-center justify-center gap-2 rounded-full bg-accent-100 px-4 py-2 text-[14px] font-semibold text-accent-800 hover:bg-accent-200"
      >
        <Download aria-hidden className="h-4 w-4" />
        Download my data
      </button>

      {confirming ? (
        <div className="flex flex-col gap-2" data-testid="delete-confirm">
          <p className="text-sm text-muted">
            This signs you out everywhere and schedules everything you have here for deletion.
            An administrator can restore it during the recovery window; after that it is
            permanent.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(): void => {
                void onDelete().catch(() => setConfirming(false));
              }}
              data-testid="delete-confirm-button"
              className="flex-1 rounded-full bg-accent px-4 py-2 text-[14px] font-semibold text-bg hover:bg-accent-600"
            >
              Yes, delete my account
            </button>
            <button
              type="button"
              onClick={(): void => setConfirming(false)}
              className="flex-1 rounded-full bg-accent-100 px-4 py-2 text-[14px] font-semibold text-accent-800 hover:bg-accent-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={(): void => setConfirming(true)}
          data-testid="delete-button"
          className="flex items-center justify-center gap-2 rounded-full bg-accent-100 px-4 py-2 text-[14px] font-semibold text-accent-800 hover:bg-accent-200"
        >
          <Trash2 aria-hidden className="h-4 w-4" />
          Delete my account
        </button>
      )}
    </section>
  );
}

/**
 * The signed-in account surface (spec 013 US2).
 *
 * Two things a person can do to their own account: rename themselves, and start a password
 * reset. Notably NOT here: changing the email address. It is the key FR-AC-008 matches on
 * when a new provider appears, so a self-service edit would let someone re-point their
 * identity at an address they have not proved they own. It is refreshed from the verified
 * claim instead (FR-AC-034), and locked at the provider as defence in depth (FR-AC-035).
 */
export function ProfilePanel(): React.JSX.Element | null {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [deleted, setDeleted] = useState<{ recoverableForDays: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAccountProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setDisplayName(p.displayName);
      })
      .catch(() => {
        // No account record, or an expired session the http layer is already handling.
        // Rendering nothing beats rendering a blank profile that looks real.
        if (!cancelled) setProfile(null);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  if (!profile) return null;

  async function onSave(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateDisplayName(displayName);
      setSaved(true);
    } catch {
      setError('Could not save your display name. Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function onResetPassword(): Promise<void> {
    if (!profile?.email) return;
    await requestPasswordReset(profile.email);
    // Always the same message. The server answers 202 either way (FR-AC-023), so there is
    // nothing to branch on — and nothing this could report that would not re-create the
    // enumeration oracle the endpoint exists to avoid.
    setResetSent(true);
  }

  async function onExport(): Promise<void> {
    setError(null);
    try {
      const data = await exportOwnData();
      // Handed over as a file the person keeps, not rendered — an export is for taking
      // elsewhere. Built from a blob URL so nothing but the browser ever sees it.
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fridge-planner-export.json';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not export your data. Try again.');
    }
  }

  async function onDelete(): Promise<void> {
    setError(null);
    try {
      setDeleted(await deleteOwnAccount());
    } catch (err) {
      // Includes the administrator refusal (FR-AC-026), whose message explains what to do
      // instead — so it is shown as written rather than replaced with a generic failure.
      setError(err instanceof Error ? err.message : 'Could not delete your account.');
      throw err; // lets DataControls drop back out of its confirmation state
    }
  }

  if (deleted) {
    return (
      <div
        className="rounded-[16px] bg-surface px-4 py-4 text-sm text-ink"
        data-testid="account-deleted-notice"
      >
        <p className="font-semibold">Your account is scheduled for deletion</p>
        <p className="mt-1 text-muted">
          You have been signed out of everything. It can be restored for{' '}
          {deleted.recoverableForDays} days by an administrator; after that it is permanent.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="profile-panel">
      <form onSubmit={onSave} className="flex flex-col gap-3 rounded-[16px] bg-surface px-4 py-4">
        <div>
          <label className="block text-[13px] font-semibold text-ink" htmlFor="profile-name">
            Display name
          </label>
          <input
            id="profile-name"
            type="text"
            required
            className={FIELD_CLASS}
            value={displayName}
            onChange={(e): void => {
              setDisplayName(e.target.value);
              setSaved(false);
            }}
          />
        </div>

        <div>
          <p className="text-[13px] font-semibold text-ink">Email</p>
          <p className="text-sm text-muted" data-testid="profile-email">
            {profile.email ?? 'Not set'}
          </p>
          <p className="mt-1 text-xs text-muted">
            Your email is managed by your identity provider and stays in step automatically.
          </p>
        </div>

        {error && (
          <p role="alert" data-testid="profile-error" className="rounded-lg bg-accent-100 p-3 text-sm text-accent-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || displayName.trim() === ''}
          className="flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-[14px] font-semibold text-bg hover:bg-accent-600 disabled:opacity-60"
        >
          {saved ? <Check aria-hidden className="h-4 w-4" /> : null}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save display name'}
        </button>
      </form>

      <section className="flex flex-col gap-2 rounded-[16px] bg-surface px-4 py-4">
        <h3 className="text-[13px] font-semibold text-ink">Password</h3>
        {resetSent ? (
          <p className="text-sm text-muted" data-testid="profile-reset-sent">
            If that address has an account, a reset link is on its way. Your provider hosts the
            form — we never see your password.
          </p>
        ) : (
          <button
            type="button"
            onClick={onResetPassword}
            data-testid="profile-reset-button"
            className="flex items-center justify-center gap-2 rounded-full bg-accent-100 px-4 py-2 text-[14px] font-semibold text-accent-800 hover:bg-accent-200"
          >
            <KeyRound aria-hidden className="h-4 w-4" />
            Reset password
          </button>
        )}
      </section>

      <DataControls onExport={onExport} onDelete={onDelete} />
    </div>
  );
}
