'use client';
import { useCallback, useEffect, useState } from 'react';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { FeedbackTriageList } from '../components/admin/FeedbackTriageList';
import { UserDataPanel } from '../components/admin/UserDataPanel';
import { OpsPanel } from '../components/admin/OpsPanel';
import { AccountsPanel } from '../components/admin/AccountsPanel';
import { SettingsPanel } from '../components/admin/SettingsPanel';
import { TriageQueue } from '../components/admin/TriageQueue';
import {
  fetchAdminFeedback,
  promoteFeedback,
  type AdminFeedbackRow,
  type AdminFeedbackStatus,
} from '../services/admin';

const FILTERS: Array<{ label: string; value: AdminFeedbackStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Complete', value: 'complete' },
  { label: 'Draft', value: 'draft' },
  { label: 'Reviewed', value: 'reviewed' },
];

type Tab = 'triage' | 'ops' | 'accounts' | 'settings';

const TABS: Array<{ label: string; value: Tab }> = [
  { label: 'Triage', value: 'triage' },
  { label: 'Operations', value: 'ops' },
  { label: 'Accounts', value: 'accounts' },
  { label: 'Settings', value: 'settings' },
];

interface TriageTabProps {
  rows: AdminFeedbackRow[];
  loading: boolean;
  filter: AdminFeedbackStatus | 'all';
  busyId: string | null;
  supportUserId: string | null;
  onFilter: (value: AdminFeedbackStatus | 'all') => void;
  onPromote: (id: string) => void;
  onSelect: (id: string) => void;
  onCloseSupport: () => void;
}

function TriageTab(props: TriageTabProps): React.JSX.Element {
  const { rows, loading, filter, busyId, supportUserId } = props;
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => props.onFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`rounded-full px-4 py-2 text-[13px] font-semibold ${
              filter === f.value ? 'bg-accent text-bg' : 'bg-accent-100 text-accent-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="text-[14px] text-ink-soft">Loading…</p>
        ) : (
          <FeedbackTriageList
            rows={rows}
            busyId={busyId}
            onPromote={props.onPromote}
            onSelect={props.onSelect}
          />
        )}
      </div>

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
  const [rows, setRows] = useState<AdminFeedbackRow[]>([]);
  const [filter, setFilter] = useState<AdminFeedbackStatus | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [supportUserId, setSupportUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('triage');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const next = await fetchAdminFeedback(filter === 'all' ? {} : { status: filter });
      setRows(next);
      setError(null);
    } catch {
      // Includes the 403 an ordinary user gets here — the server's refusal is what
      // actually gates this screen (FR-AD-002).
      setError('You do not have access to this area.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePromote = useCallback(
    async (id: string): Promise<void> => {
      setBusyId(id);
      try {
        await promoteFeedback(id);
        await load();
      } catch {
        setError('Could not promote that report. It may already be in the pipeline.');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

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
            rows={rows}
            loading={loading}
            filter={filter}
            busyId={busyId}
            supportUserId={supportUserId}
            onFilter={setFilter}
            onPromote={(id) => void handlePromote(id)}
            onSelect={(id) => setSupportUserId(rows.find((r) => r._id === id)?.userId ?? null)}
            onCloseSupport={() => setSupportUserId(null)}
          />
        )}
        {/* Spec 012 US1. The lifecycle queue sits alongside the record list rather than in its
            own tab: D7 puts triage AND delivery on one maintainer surface, and splitting the
            two halves of triage across tabs would undo that. */}
        {tab === 'triage' && <TriageQueue />}
        {tab === 'ops' && <OpsPanel />}
        {/* Prefilled with whoever is under investigation in triage — the common path
            into this tab is "this reporter asked to be erased". */}
        {tab === 'accounts' && (
          <AccountsPanel {...(supportUserId ? { initialUserId: supportUserId } : {})} />
        )}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </main>
  );
}
