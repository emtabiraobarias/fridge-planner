'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StageFilter, STAGE_LABEL, type StageFilterValue } from './StageFilter';
import { LifecycleItemModal } from './LifecycleItemModal';
import { QueueStatus } from './QueueStatus';
import {
  applyLifecycleAction,
  fetchQueue,
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
    // A record has no `title` until the conversation completes (FR-F-003), so fall back to what
    // the reporter actually said. Without it every draft read "(untitled draft)" and the list
    // could be seen but not used.
    title: r.title ?? r.excerpt ?? '(untitled draft)',
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

function QueueRow({ row, onOpen }: { row: Row; onOpen: () => void }): React.JSX.Element {
  return (
    <li data-testid={`triage-row-${row.id}`}>
      <button
        type="button"
        onClick={onOpen}
        disabled={!row.item}
        className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-surface p-3 text-left enabled:hover:bg-ink/[0.04] disabled:cursor-default"
      >
        <span className="min-w-0 flex-1 basis-full sm:basis-auto">
          <span className="block truncate text-sm font-semibold text-ink">{row.title}</span>
          <span className="text-muted block text-xs">
            {/* Attribution — FR-AD-009. Before spec 011 the maintainer could not see whose
                report this was, or that it existed at all. */}
            <span data-testid={`triage-author-${row.id}`}>{row.userId}</span>
            {` · ${row.meta}`}
            {/* A detached item has no reporter to attribute it to (FR-FL-060). */}
            {row.erased ? ' · reporter erased' : ''}
          </span>
        </span>
        <span
          data-testid={`stage-${row.id}`}
          className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-800"
        >
          {STAGE_LABEL[row.stage] ?? row.stage}
        </span>
      </button>
    </li>
  );
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
  /** A refused ACTION, shown in the open item — not above the list, where it read as a
   *  second copy of whatever the load said. */
  const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState<StageFilterValue>('all');
  // Every control an item offers lives in its modal, not on its row (see LifecycleItemModal).
  const [openId, setOpenId] = useState<string | null>(null);

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
  const open = items.find((i) => i._id === openId) ?? null;

  async function act(id: string, action: Parameters<typeof applyLifecycleAction>[1]): Promise<void> {
    setActionError('');
    try {
      await applyLifecycleAction(id, action);
      await refresh();
    } catch {
      setActionError('That action was refused. The item may have changed — refresh and try again.');
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

      <QueueStatus
        error={error}
        loading={loading}
        empty={visible.length === 0}
        wholeQueueEmpty={rows.length === 0}
        emptyText="No feedback reports yet. When someone submits one, it appears here."
        filteredEmptyText="Nothing at this stage."
      />

      <ul className="flex flex-col gap-2" aria-label="Feedback reports">
        {visible.map((row) => (
          <QueueRow key={row.id} row={row} onOpen={() => row.item && setOpenId(row.id)} />
        ))}
      </ul>

      {open && (
        <LifecycleItemModal
          item={open}
          mergeTargets={items.filter((t) => t._id !== open._id && t.stage !== 'merged')}
          onAction={(action) => void act(open._id, action)}
          onClose={() => setOpenId(null)}
          onOpenReporter={(userId) => {
            setOpenId(null);
            onSelectUser(userId);
          }}
          {...(actionError ? { error: actionError } : {})}
        />
      )}
    </section>
  );
}
