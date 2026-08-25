'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StageFilter, STAGE_LABEL, type StageFilterValue } from './StageFilter';
import {
  applyLifecycleAction,
  fetchQueue,
  type DismissalReason,
  type LifecycleStage,
  type LifecycleSummary,
} from '../../services/lifecycle';
import type { AdminFeedbackRow } from '../../services/admin';

/**
 * The maintainer's triage queue (spec 012 US1) — the **only** list on the Triage tab.
 *
 * It used to sit below a second, independent list of feedback records filtered by record
 * `status`. Two lists showing overlapping items, only one of which responded to the filter,
 * read as "the filter is broken": the records list emptied while the queue below it did not
 * move. Record `status` is upstream plumbing anyway — since FR-FL-001 an item is enqueued
 * automatically the moment a record reaches `complete`, so `reviewed` no longer marks anything
 * a maintainer acts on and the old Promote control had nothing left to do.
 *
 * Filtering is therefore by **stage**, which is what FR-AD-009 asked for all along
 * ("filtering by status and lifecycle stage"). `Draft` is kept as a filter because a record
 * that never completes has no lifecycle item, and dropping it would make abandoned
 * conversations unreachable from the admin surface entirely.
 *
 * Lives on the ADMIN surface, never the reporter's (FR-FL-052/053) — and the server refuses
 * these actions regardless of what renders, because hiding a control is a courtesy, not the
 * enforcement (FR-FL-054).
 */

const REASONS: { value: DismissalReason; label: string }[] = [
  { value: 'no-action-required', label: 'No action required' },
  { value: 'declined', label: 'Declined' },
];

interface Row {
  id: string;
  title: string;
  userId: string;
  meta: string;
  stage: LifecycleStage | 'draft';
  erased: boolean;
  /** Absent for a draft — a record with no lifecycle item has no action to offer yet. */
  item?: LifecycleSummary;
}

function draftRow(r: AdminFeedbackRow): Row {
  return {
    id: r._id,
    title: r.title ?? '(untitled draft)',
    userId: r.userId,
    meta: [r.type, r.affectedArea].filter(Boolean).join(' · ') || 'conversation not finished',
    stage: 'draft',
    erased: false,
  };
}

function itemRow(i: LifecycleSummary): Row {
  return {
    id: i._id,
    title: i.sourceTitle,
    userId: i.userId,
    meta: `${i.sourceType} · ${i.sourceAffectedArea}`,
    stage: i.stage,
    erased: Boolean(i.reporterErasedAt),
    item: i,
  };
}

interface TriageQueueProps {
  /** Records with no lifecycle item yet. Passed in rather than fetched — `AdminPage` already
   *  loads them, and that same request is the screen's FR-AD-002 refusal probe. */
  drafts: AdminFeedbackRow[];
  /** Opens the reporter's kitchen read-only (FR-AD-015). */
  onSelectUser: (userId: string) => void;
}

export function TriageQueue({ drafts, onSelectUser }: TriageQueueProps): React.JSX.Element {
  const [items, setItems] = useState<LifecycleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<StageFilterValue>('all');
  // Two-step dismiss: the reason is part of the decision, so it is chosen before the action
  // fires rather than defaulted (FR-FL-016).
  const [dismissing, setDismissing] = useState<string | null>(null);
  // Merging needs a target, so it is a two-step choice like dismissal: pick the item, then pick
  // what it duplicates (FR-FL-018).
  const [merging, setMerging] = useState<string | null>(null);

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

  const rows = useMemo(
    () => [...drafts.map(draftRow), ...items.map(itemRow)],
    [drafts, items],
  );

  const visible = filter === 'all' ? rows : rows.filter((r) => r.stage === filter);

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
    <section aria-label="Triage queue">
      <StageFilter stages={rows.map((r) => r.stage)} value={filter} onChange={setFilter} />

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
      {!loading && !error && visible.length === 0 && (
        <p className="rounded-[16px] bg-accent-100 p-5 text-[14px] text-accent-800">
          {rows.length === 0
            ? 'No feedback reports yet. When someone submits one, it appears here.'
            : 'Nothing at this stage.'}
        </p>
      )}

      {/* Report text is rendered as text (FR-AD-014). React escapes it by construction; there is
          deliberately no `dangerouslySetInnerHTML` anywhere in this tree, so a report containing
          instruction-like or markup-like content is displayed, never interpreted. */}
      <ul className="flex flex-col gap-2" aria-label="Feedback reports">
        {visible.map((row) => (
          <li
            key={row.id}
            data-testid={`triage-row-${row.id}`}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-surface p-3"
          >
            <div className="min-w-0 flex-1 basis-full sm:basis-auto">
              <button
                type="button"
                onClick={() => onSelectUser(row.userId)}
                className="max-w-full truncate text-left text-sm font-semibold text-ink hover:underline"
              >
                {row.title}
              </button>
              <p className="text-muted text-xs">
                {/* Attribution — FR-AD-009. Before spec 011 the maintainer could not see whose
                    report this was, or that it existed at all. */}
                <span data-testid={`triage-author-${row.id}`}>{row.userId}</span>
                {` · ${row.meta}`}
                {/* A detached item has no reporter to attribute it to (FR-FL-060). */}
                {row.erased ? ' · reporter erased' : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid={`stage-${row.id}`}
                className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-800"
              >
                {STAGE_LABEL[row.stage] ?? row.stage}
              </span>

              {row.stage === 'new' && dismissing !== row.id && merging !== row.id && (
                <>
                  <button
                    onClick={() => void act(row.id, { action: 'accept' })}
                    className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-600"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => setDismissing(row.id)}
                    className="text-xs font-semibold text-accent-700 hover:text-accent-800"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => setMerging(row.id)}
                    className="text-muted text-xs font-semibold hover:text-ink"
                  >
                    Merge
                  </button>
                </>
              )}

              {merging === row.id && (
                <>
                  <span className="text-muted text-xs">Duplicate of:</span>
                  {items
                    .filter((t) => t._id !== row.id && t.stage !== 'merged')
                    .slice(0, 4)
                    .map((t) => (
                      <button
                        key={t._id}
                        onClick={() => {
                          setMerging(null);
                          void act(row.id, { action: 'merge', targetId: t._id });
                        }}
                        className="max-w-[14rem] truncate rounded-full border border-divider px-3 py-1 text-xs font-semibold text-ink hover:bg-ink/[0.07]"
                      >
                        {t.sourceTitle}
                      </button>
                    ))}
                  <button
                    onClick={() => setMerging(null)}
                    className="text-muted text-xs font-semibold hover:text-ink"
                  >
                    Cancel
                  </button>
                </>
              )}

              {dismissing === row.id && (
                <>
                  <span className="text-muted text-xs">Reason:</span>
                  {REASONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => void act(row.id, { action: 'dismiss', reason: r.value })}
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
