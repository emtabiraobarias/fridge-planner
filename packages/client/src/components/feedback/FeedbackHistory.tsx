'use client';
import { useEffect } from 'react';
import { useFeedback } from '../../context/FeedbackContext';
import { fetchFeedbackExport } from '../../services/feedback';
import type { FeedbackRecord } from '../../services/feedback';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-800',
  complete: 'bg-green-100 text-green-800',
  reviewed: 'bg-blue-100 text-blue-800',
};

async function exportRecord(record: FeedbackRecord): Promise<void> {
  const md = await fetchFeedbackExport(record._id);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `feedback-${record._id}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/** P2/P3: a list of the user's own feedback records with status, export, and delete. */
export function FeedbackHistory(): React.JSX.Element {
  const { records, listLoading, refreshList, remove } = useFeedback();

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  return (
    <section className="mt-8" aria-label="Your feedback history">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Your feedback</h2>
        <button onClick={() => void refreshList()} className="text-sm text-indigo-600 hover:underline">
          Refresh
        </button>
      </div>

      {listLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {!listLoading && records.length === 0 && (
        <p className="text-sm text-gray-500">You haven’t submitted any feedback yet.</p>
      )}

      <ul className="flex flex-col gap-2">
        {records.map((r) => (
          <li key={r._id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{r.title ?? '(draft — not yet titled)'}</p>
              <p className="text-xs text-gray-500">
                {r.type ?? 'unclassified'} · {new Date(r.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] ?? ''}`}>
                {r.status}
              </span>
              {r.status !== 'draft' && (
                <button
                  onClick={() => void exportRecord(r)}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  Export
                </button>
              )}
              <button
                onClick={() => void remove(r._id)}
                aria-label={`Delete feedback ${r.title ?? r._id}`}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
