'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  applyLifecycleAction,
  fetchQueue,
  type DismissalReason,
  type LifecycleSummary,
} from '../../services/lifecycle';

/**
 * The maintainer's triage queue (spec 012 US1).
 *
 * Lives on the ADMIN surface, never the reporter's (FR-FL-052/053) — and the server refuses
 * these actions regardless of what renders, because hiding a control is a courtesy, not the
 * enforcement (FR-FL-054).
 */

const STAGE_LABEL: Record<string, string> = {
  new: 'New',
  accepted: 'Accepted',
  briefed: 'Briefed',
  'in-spec': 'In spec',
  'in-progress': 'In progress',
  'in-review': 'In review',
  shipped: 'Shipped',
  closed: 'Closed',
  dismissed: 'Dismissed',
  merged: 'Merged',
  parked: 'Parked',
};

const REASONS: { value: DismissalReason; label: string }[] = [
  { value: 'no-action-required', label: 'No action required' },
  { value: 'declined', label: 'Declined' },
];

export function TriageQueue(): React.JSX.Element {
  const [items, setItems] = useState<LifecycleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Two-step dismiss: the reason is part of the decision, so it is chosen before the action
  // fires rather than defaulted (FR-FL-016).
  const [dismissing, setDismissing] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchQueue());
    } catch {
      // A failure must never be mistaken for an empty queue (the FR-F-021 lesson).
      setError('Could not load the triage queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(id: string, action: Parameters<typeof applyLifecycleAction>[1]): Promise<void> {
    setError('');
    try {
      await applyLifecycleAction(id, action);
      setDismissing(null);
      await refresh();
    } catch {
      setError('That action was refused. The item may have changed — refresh and try again.');
    }
  }

  return (
    <section aria-label="Triage queue" className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-heading text-h5 text-ink">Triage queue</h2>
        <button
          onClick={() => void refresh()}
          className="text-sm font-semibold text-accent hover:text-accent-600"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-accent-100 p-2 text-sm text-accent-800">
          {error}
        </p>
      )}
      {loading && <p className="text-muted text-sm">Loading…</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-muted text-sm">Nothing waiting in triage.</p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item._id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-surface p-3"
          >
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <p className="truncate text-sm font-semibold text-ink">{item.sourceTitle}</p>
              <p className="text-muted text-xs">
                {item.sourceType} · {item.sourceAffectedArea}
                {/* A detached item has no reporter to attribute it to (FR-FL-060). */}
                {item.reporterErasedAt ? ' · reporter erased' : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid={`stage-${item._id}`}
                className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-800"
              >
                {STAGE_LABEL[item.stage] ?? item.stage}
              </span>

              {item.stage === 'new' && dismissing !== item._id && (
                <>
                  <button
                    onClick={() => void act(item._id, { action: 'accept' })}
                    className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-600"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => setDismissing(item._id)}
                    className="text-xs font-semibold text-accent-700 hover:text-accent-800"
                  >
                    Dismiss
                  </button>
                </>
              )}

              {dismissing === item._id && (
                <>
                  <span className="text-muted text-xs">Reason:</span>
                  {REASONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => void act(item._id, { action: 'dismiss', reason: r.value })}
                      className="rounded-full border border-divider px-3 py-1 text-xs font-semibold text-ink hover:bg-ink/[0.07]"
                    >
                      {r.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setDismissing(null)}
                    className="text-muted text-xs font-semibold hover:text-ink"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
