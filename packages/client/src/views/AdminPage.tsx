'use client';
import { useCallback, useEffect, useState } from 'react';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { UserDataPanel } from '../components/admin/UserDataPanel';
import { OpsPanel } from '../components/admin/OpsPanel';
import { AccountsPanel } from '../components/admin/AccountsPanel';
import { SettingsPanel } from '../components/admin/SettingsPanel';
import { TriageQueue } from '../components/admin/TriageQueue';
import { DeliveryPanel } from '../components/admin/DeliveryPanel';
import { fetchAdminFeedback, type AdminFeedbackRow } from '../services/admin';

type Tab = 'triage' | 'delivery' | 'ops' | 'accounts' | 'settings';

/**
 * Tabs whose body is just a panel with no props from this component. Keeping them in a lookup
 * stops each new tab adding a branch to `AdminPage`, which is what pushed it past the
 * complexity limit when Delivery arrived. `triage` and `accounts` stay inline below — they
 * take state this component owns.
 */
const SIMPLE_TABS: Partial<Record<Tab, () => React.JSX.Element>> = {
  delivery: () => <DeliveryPanel />,
  ops: () => <OpsPanel />,
  settings: () => <SettingsPanel />,
};

const TABS: Array<{ label: string; value: Tab }> = [
  { label: 'Triage', value: 'triage' },
  { label: 'Delivery', value: 'delivery' },
  { label: 'Operations', value: 'ops' },
  { label: 'Accounts', value: 'accounts' },
  { label: 'Settings', value: 'settings' },
];

interface TriageTabProps {
  drafts: AdminFeedbackRow[];
  loading: boolean;
  supportUserId: string | null;
  onSelectUser: (userId: string) => void;
  onCloseSupport: () => void;
}

/**
 * Triage is ONE list (spec 012 US1, FR-FL-023).
 *
 * It carried two until 2026-08-26: the spec-011 record list filtered by record `status`, with
 * the lifecycle queue stacked underneath it. The queue ignored the filter, so changing it
 * emptied the top list while the bottom one stayed put — indistinguishable from a filter that
 * does nothing. Since FR-FL-001 enqueues every completed record automatically, the record list
 * had no action of its own left to offer, so the queue absorbed it: attribution, the
 * click-through to the reporter's kitchen, and filtering — now by stage, per FR-AD-009.
 */
function TriageTab(props: TriageTabProps): React.JSX.Element {
  const { drafts, loading, supportUserId } = props;
  return (
    <>
      {loading ? (
        <p className="text-[14px] text-ink-soft">Loading…</p>
      ) : (
        <TriageQueue drafts={drafts} onSelectUser={props.onSelectUser} />
      )}

      {/* US3: open the reporter's kitchen read-only, so "my grocery list is wrong"
          can actually be investigated instead of guessed at (FR-AD-015). */}
      {supportUserId && <UserDataPanel userId={supportUserId} onClose={props.onCloseSupport} />}
    </>
  );
}

/**
 * The administration screen (spec 011).
 *
 * Its reason to exist is the spec's Defect 2: feedback was collected and then hidden
 * from the only person able to act on it. This is where reports from **every** user
 * finally become visible to the maintainer — and, since 4.14.0, where the operational
 * and account capabilities that shipped API-only in 4.12.0 finally have a surface.
 *
 * The refused state below is rendered from a real API refusal, not from `useIsAdmin`
 * alone — the server is the authority (FR-AD-002), and a non-admin who navigates here
 * directly must see the same refusal as one who is redirected. The feedback request is
 * both the triage data source and that probe, so the gate cannot drift from the data.
 */
export function AdminPage(): React.JSX.Element {
  const isAdmin = useIsAdmin();
  /** Records with no lifecycle item yet. This request doubles as the FR-AD-002 probe below. */
  const [drafts, setDrafts] = useState<AdminFeedbackRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [supportUserId, setSupportUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('triage');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setDrafts(await fetchAdminFeedback({ status: 'draft' }));
      setError(null);
    } catch {
      // Includes the 403 an ordinary user gets here — the server's refusal is what
      // actually gates this screen (FR-AD-002).
      setError('You do not have access to this area.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (isAdmin === false || error) {
    return (
      <main className="mx-auto w-full max-w-content px-5 py-8">
        <h1 className="font-heading text-[28px] text-ink">Administration</h1>
        <p className="mt-3 rounded-[16px] bg-accent-100 p-5 text-[14px] text-accent-800">
          {error ?? 'You do not have access to this area.'}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-content px-5 py-8">
      <h1 className="font-heading text-[28px] text-ink">Administration</h1>
      <p className="mt-1 text-[14px] text-ink-soft">
        Feedback from every user, the levers that keep the app running, and the accounts it holds
        data for.
      </p>

      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Administration areas">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-full px-4 py-2 text-[13px] font-semibold ${
              tab === t.value ? 'bg-accent2-500 text-bg' : 'bg-neutral-200 text-neutral-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'triage' && (
          <TriageTab
            drafts={drafts}
            loading={loading}
            supportUserId={supportUserId}
            onSelectUser={setSupportUserId}
            onCloseSupport={() => setSupportUserId(null)}
          />
        )}
        {/* D7: triage AND delivery on one maintainer surface (FR-FL-056). Looked up rather than
            chained — each added tab was another branch in an already-long component. */}
        {SIMPLE_TABS[tab]?.()}
        {/* Prefilled with whoever is under investigation in triage — the common path
            into this tab is "this reporter asked to be erased". */}
        {tab === 'accounts' && (
          <AccountsPanel {...(supportUserId ? { initialUserId: supportUserId } : {})} />
        )}
      </div>
    </main>
  );
}
