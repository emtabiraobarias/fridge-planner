'use client';
import type { AdminFeedbackRow } from '../../services/admin';

interface FeedbackTriageListProps {
  rows: AdminFeedbackRow[];
  busyId: string | null;
  onPromote: (id: string) => void;
  onSelect: (id: string) => void;
}

const STAGE_LABEL: Record<string, string> = {
  approved: 'Approved',
  'in-spec': 'In spec',
  'in-review': 'In review',
  shipped: 'Shipped',
  parked: 'Parked',
};

/**
 * The maintainer's triage list (spec 011 US2, FR-AD-009).
 *
 * Every row is **attributed to its author** — that attribution is the whole point of
 * this screen, since before spec 011 the maintainer could not see other people's
 * reports at all.
 *
 * Report text is rendered as text (FR-AD-014). React escapes it by construction; there
 * is deliberately no `dangerouslySetInnerHTML` anywhere in this tree, so a report
 * containing instruction-like or markup-like content is displayed, never interpreted.
 */
export function FeedbackTriageList({
  rows,
  busyId,
  onPromote,
  onSelect,
}: FeedbackTriageListProps): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <p className="rounded-[16px] bg-accent-100 p-5 text-[14px] text-accent-800">
        No feedback reports yet. When someone submits one, it appears here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Feedback reports">
      {rows.map((row) => (
        <li
          key={row._id}
          className="flex flex-wrap items-center gap-3 rounded-[16px] bg-surface p-4 shadow-sm"
          data-testid={`triage-row-${row._id}`}
        >
          <div className="min-w-[200px] flex-1">
            <button
              type="button"
              onClick={() => onSelect(row._id)}
              className="text-left text-[15px] font-semibold text-ink hover:underline"
            >
              {row.title ?? '(untitled draft)'}
            </button>
            <p className="mt-1 text-[12px] text-ink-soft">
              {/* Attribution — FR-AD-009. */}
              <span data-testid={`triage-author-${row._id}`}>{row.userId}</span>
              {row.affectedArea ? ` · ${row.affectedArea}` : ''}
              {row.type ? ` · ${row.type}` : ''}
            </p>
          </div>

          <span
            className="rounded-full bg-accent-100 px-3 py-1 text-[12px] font-semibold text-accent-800"
            data-testid={`triage-status-${row._id}`}
          >
            {row.pipelineStage ? (STAGE_LABEL[row.pipelineStage] ?? row.pipelineStage) : row.status}
          </span>

          {/* Only a completed, not-yet-promoted report can enter the pipeline
              (`003` FR-F-013 — drafts are not promotable). */}
          {row.status === 'complete' && !row.pipelineStage && (
            <button
              type="button"
              onClick={() => onPromote(row._id)}
              disabled={busyId === row._id}
              className="shrink-0 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-bg hover:bg-accent-600 disabled:opacity-60"
            >
              {busyId === row._id ? 'Promoting…' : 'Promote'}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
