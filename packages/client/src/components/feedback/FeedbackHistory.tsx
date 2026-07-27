'use client';
import { useEffect, useState } from 'react';
import { useFeedback } from '../../context/FeedbackContext';
import { fetchFeedbackExport } from '../../services/feedback';
import type { FeedbackRecord } from '../../services/feedback';
import { PromoteButton } from './PromoteButton';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-neutral-100 text-neutral-800',
  complete: 'bg-accent2-100 text-accent2-800',
  reviewed: 'bg-accent-100 text-accent-800',
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
  const { records, listLoading, listError, refreshList, remove, resume } = useFeedback();
  // Export runs outside the context, so it needs its own slot — but shares one message
  // area, because two stacked error banners would be noise.
  const [exportError, setExportError] = useState('');
  const message = listError || exportError;

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  return (
    <section className="mt-8" aria-label="Your feedback history">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-heading text-h5 text-ink">Your feedback</h2>
        <button
          onClick={() => void refreshList()}
          className="text-sm font-semibold text-accent hover:text-accent-600"
        >
          Refresh
        </button>
      </div>

      {/* A failure must never be mistaken for emptiness: the empty state is suppressed
          whenever a list operation failed, otherwise a user with records is told they
          have none (FR-F-021). */}
      {message && (
        <p role="alert" className="mb-2 rounded-lg bg-accent-100 p-2 text-sm text-accent-800">
          {message}
        </p>
      )}
      {listLoading && <p className="text-muted text-sm">Loading…</p>}
      {!listLoading && !message && records.length === 0 && (
        <p className="text-muted text-sm">You haven’t submitted any feedback yet.</p>
      )}

      {/* Rows wrap rather than sitting on one line: the action group (status +
          Export + Promote to development + Delete) needs ~230px, which does not
          fit beside the title at 390px. It was `shrink-0` inside a non-wrapping
          flex row, so it overflowed to 394px and was *clipped* — no page
          scrollbar, just unreachable buttons. Reported by the user as "the
          feedback workflow is broken on mobile" (spec 010 FR-RS-005/SC-RS-001).
          `min-w-0` lets the title truncate; the actions wrap beneath on narrow
          viewports and sit inline from `sm:`. */}
      <ul className="flex flex-col gap-2">
        {records.map((r) => (
          <li
            key={r._id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-surface p-3"
          >
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <p className="truncate text-sm font-semibold text-ink">
                {r.title ?? '(draft — not yet titled)'}
              </p>
              <p className="text-muted text-xs">
                {r.type ?? 'unclassified'} · {new Date(r.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] ?? ''}`}
              >
                {r.status}
              </span>
              {/* Reopening a draft has been required since FR-F-012 / US3-S1, but was never
                  wired up — `fetchFeedbackRecord` sat unused in the service layer, so a draft's
                  only available action was Delete. */}
              {r.status === 'draft' && (
                <button
                  onClick={() => void resume(r._id)}
                  className="text-xs font-semibold text-accent hover:text-accent-600"
                >
                  Continue
                </button>
              )}
              {r.status !== 'draft' && (
                <button
                  onClick={() => {
                    setExportError('');
                    void exportRecord(r).catch(() =>
                      setExportError('Could not export that record. Please try again.'),
                    );
                  }}
                  className="text-xs font-semibold text-accent hover:text-accent-600"
                >
                  Export
                </button>
              )}
              <PromoteButton record={r} />
              <button
                onClick={() => void remove(r._id)}
                aria-label={`Delete feedback ${r.title ?? r._id}`}
                className="text-xs font-semibold text-accent-700 hover:text-accent-800"
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
