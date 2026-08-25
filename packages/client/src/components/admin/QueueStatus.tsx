'use client';

/**
 * The three things a queue can be other than a list of rows.
 *
 * Shared so neither panel can drift on the one that matters: a failed load must never render as
 * an empty queue (the FR-F-021 lesson) — a maintainer with work in flight being told there is
 * none is worse than an error, because nothing prompts them to look again.
 */
interface QueueStatusProps {
  error: string;
  loading: boolean;
  /** Nothing matches the current filter. */
  empty: boolean;
  /** True when the queue itself is empty, not merely the chosen stage. */
  wholeQueueEmpty: boolean;
  emptyText: string;
  filteredEmptyText: string;
}

export function QueueStatus({
  error,
  loading,
  empty,
  wholeQueueEmpty,
  emptyText,
  filteredEmptyText,
}: QueueStatusProps): React.JSX.Element {
  return (
    <>
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-accent-100 p-2 text-sm text-accent-800">
          {error}
        </p>
      )}
      {loading && <p className="text-muted text-sm">Loading…</p>}
      {!loading && !error && empty && (
        <p className="text-muted rounded-[16px] bg-accent-100 p-5 text-[14px] text-accent-800">
          {wholeQueueEmpty ? emptyText : filteredEmptyText}
        </p>
      )}
    </>
  );
}
