'use client';
import { useCallback, useState } from 'react';
import {
  exportUser,
  eraseUser,
  restoreUser,
  purgeExpired,
  type AccountExport,
} from '../../services/admin';

interface AccountsPanelProps {
  /** Prefilled from the selected report, so the common path needs no typing. */
  initialUserId?: string;
}

/**
 * Account export & two-phase erasure (spec 011 US6 — FR-AD-017..020).
 *
 * There is deliberately **no user picker**: the app holds no user directory (identities
 * live in the IdP) and exposes no `GET /admin/users`, so inventing a list here would mean
 * inventing a source of truth. The maintainer arrives with a specific `userId` — from a
 * feedback report or a support request — and that is what this panel takes.
 *
 * Erase is confirmed inline (mirrors `003` FR-F-020) because it is the one action here a
 * mistake cannot be shrugged off: the account becomes inaccessible immediately. It stays
 * *recoverable* for the window the server reports, and the panel says so explicitly
 * rather than implying the erase was final.
 */
export function AccountsPanel({ initialUserId }: AccountsPanelProps): React.JSX.Element {
  const [userId, setUserId] = useState(initialUserId ?? '');
  const [confirming, setConfirming] = useState(false);
  const [exported, setExported] = useState<AccountExport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const target = userId.trim();

  /** One place to run an action, so every path clears the previous message first. */
  const run = useCallback(async (work: () => Promise<string>): Promise<void> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
    } catch {
      setError('That action was refused. The account may not exist, or already be erased.');
    } finally {
      setBusy(false);
    }
  }, []);

  const onExport = useCallback((): void => {
    void run(async () => {
      const data = await exportUser(target);
      setExported(data);
      return `Exported ${data.collections.length} collections for ${data.userId}.`;
    });
  }, [run, target]);

  const onErase = useCallback((): void => {
    setConfirming(false);
    void run(async () => {
      const res = await eraseUser(target);
      return `${res.userId} erased — recoverable for ${res.recoverableForDays} days (until ${new Date(
        res.purgeAfter,
      )
        .toISOString()
        .slice(0, 10)}).`;
    });
  }, [run, target]);

  const onRestore = useCallback((): void => {
    void run(async () => {
      const res = await restoreUser(target);
      return `${res.userId} restored.`;
    });
  }, [run, target]);

  // The purge sweep is account-wide, not per-user: it acts on every erasure whose window
  // has elapsed. There is no scheduler in this codebase, so this button is one of the two
  // things that ever runs it (the other being an opportunistic sweep on these routes).
  const onPurge = useCallback((): void => {
    void run(async () => {
      const res = await purgeExpired();
      return res.count === 0
        ? 'No erasures were due for purge.'
        : `Purged ${res.count} account(s) past the recovery window.`;
    });
  }, [run]);

  return (
    <section
      className="rounded-[20px] bg-surface p-5 shadow-sm"
      aria-label="Accounts"
      data-testid="accounts-panel"
    >
      <h3 className="font-heading text-[16px] text-ink">Accounts</h3>

      <label className="mt-3 block text-[13px] font-semibold text-ink" htmlFor="accounts-user-id">
        User ID
      </label>
      <input
        id="accounts-user-id"
        value={userId}
        onChange={(e) => {
          setUserId(e.target.value);
          setConfirming(false);
        }}
        placeholder="e.g. user-a"
        className="mt-1 w-full rounded-[16px] bg-bg px-4 py-2 text-[14px] text-ink"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={!target || busy}
          className="rounded-full bg-accent-100 px-4 py-2 text-[13px] font-semibold text-accent-800 disabled:opacity-50"
        >
          Export
        </button>
        <button
          type="button"
          onClick={onRestore}
          disabled={!target || busy}
          className="rounded-full bg-accent-100 px-4 py-2 text-[13px] font-semibold text-accent-800 disabled:opacity-50"
        >
          Restore
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!target || busy}
          className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-bg disabled:opacity-50"
        >
          Erase…
        </button>
      </div>

      {confirming && (
        <div
          className="mt-3 rounded-[16px] bg-accent-100 p-4"
          role="alertdialog"
          aria-label="Confirm erase"
        >
          <p className="text-[14px] text-accent-800">
            Erase <span className="font-bold">{target}</span>? They lose access immediately. The
            data is recoverable until the window closes, then purged permanently.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onErase}
              className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-bg"
            >
              Yes, erase
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-full bg-bg px-4 py-2 text-[13px] font-semibold text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-divider pt-3">
        <button
          type="button"
          onClick={onPurge}
          disabled={busy}
          className="rounded-full bg-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-800 disabled:opacity-50"
        >
          Run purge sweep
        </button>
        <p className="mt-2 text-[13px] text-ink-soft">
          Purges every account whose recovery window has already elapsed. Nothing else.
        </p>
      </div>

      {error && (
        <p className="mt-3 text-[14px] text-accent-800" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 text-[14px] text-ink" role="status" data-testid="accounts-notice">
          {notice}
        </p>
      )}

      {exported && (
        <details className="mt-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-accent-800">
            Exported data for {exported.userId}
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-[16px] bg-bg p-3 text-[12px] text-ink">
            {JSON.stringify(exported.data, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}
