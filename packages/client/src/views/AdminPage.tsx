'use client';
import { useCallback, useEffect, useState } from 'react';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { FeedbackTriageList } from '../components/admin/FeedbackTriageList';
import { UserDataPanel } from '../components/admin/UserDataPanel';
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

/**
 * The administration screen (spec 011 US2).
 *
 * Its reason to exist is the spec's Defect 2: feedback was collected and then hidden
 * from the only person able to act on it. This is where reports from **every** user
 * finally become visible to the maintainer.
 *
 * The refused state below is rendered from a real API refusal, not from `useIsAdmin`
 * alone — the server is the authority (FR-AD-002), and a non-admin who navigates here
 * directly must see the same refusal as one who is redirected.
 */
export function AdminPage(): React.JSX.Element {
  const isAdmin = useIsAdmin();
  const [rows, setRows] = useState<AdminFeedbackRow[]>([]);
  const [filter, setFilter] = useState<AdminFeedbackStatus | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [supportUserId, setSupportUserId] = useState<string | null>(null);

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
        Feedback from every user, with the reports you can move into development.
      </p>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
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
            onPromote={(id) => void handlePromote(id)}
            onSelect={(id) => setSupportUserId(rows.find((r) => r._id === id)?.userId ?? null)}
          />
        )}
      </div>

      {/* US3: open the reporter's kitchen read-only, so "my grocery list is wrong"
          can actually be investigated instead of guessed at (FR-AD-015). */}
      {supportUserId && (
        <UserDataPanel userId={supportUserId} onClose={() => setSupportUserId(null)} />
      )}
    </main>
  );
}
