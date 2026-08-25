'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  applyLifecycleAction,
  fetchQueue,
  type LifecycleAction,
  type LifecycleStage,
  type LifecycleSummary,
} from '../../services/lifecycle';
import { StageFilter, STAGE_LABEL, type StageFilterValue } from './StageFilter';
import { LifecycleItemModal } from './LifecycleItemModal';
import { QueueStatus } from './QueueStatus';

/**
 * Delivery — the second half of the maintainer surface (spec 012 US4, D7).
 *
 * Triage and delivery sit on ONE surface deliberately: splitting them would recreate the thing
 * `003` shipped, where an item's id appeared once at promotion and was never seen again.
 */

const DELIVERY_STAGES: LifecycleStage[] = [
  'accepted',
  'briefed',
  'in-spec',
  'in-progress',
  'in-review',
  'shipped',
  'parked',
];

function DeliveryRow({
  item,
  onOpen,
}: {
  item: LifecycleSummary;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <li data-testid={`delivery-row-${item._id}`}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-surface p-3 text-left hover:bg-ink/[0.04]"
      >
        <span className="min-w-0 flex-1 basis-full sm:basis-auto">
          <span className="block truncate text-sm font-semibold text-ink">{item.sourceTitle}</span>
          <span className="text-muted block text-xs">
            {item.userId} · {item.sourceType} · {item.sourceAffectedArea}
            {/* A detached item has no reporter to attribute it to (FR-FL-060). */}
            {item.reporterErasedAt ? ' · reporter erased' : ''}
          </span>
        </span>
        <span
          data-testid={`delivery-stage-${item._id}`}
          className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-800"
        >
          {STAGE_LABEL[item.stage] ?? item.stage}
        </span>
      </button>
    </li>
  );
}

export function DeliveryPanel(): React.JSX.Element {
  const [items, setItems] = useState<LifecycleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** A refused ACTION, shown in the open item — not above the list, where it read as a
   *  second copy of whatever the load said. */
  const [actionError, setActionError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StageFilterValue>('all');

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      const all = await fetchQueue();
      setItems(all.filter((i) => DELIVERY_STAGES.includes(i.stage)));
    } catch {
      setError('Could not load delivery.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(id: string, action: LifecycleAction): Promise<void> {
    setActionError('');
    try {
      await applyLifecycleAction(id, action);
      await refresh();
    } catch {
      setActionError('That action was refused. The item may have changed — refresh and try again.');
    }
  }

  const visible = filter === 'all' ? items : items.filter((i) => i.stage === filter);
  const open = items.find((i) => i._id === openId) ?? null;

  return (
    <section aria-label="Delivery" className="mt-4">
      <StageFilter stages={items.map((i) => i.stage)} value={filter} onChange={setFilter} />
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-heading text-h5 text-ink">Delivery</h2>
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
        wholeQueueEmpty={items.length === 0}
        emptyText="Nothing in delivery."
        filteredEmptyText="Nothing at this stage."
      />

      <ul className="flex flex-col gap-2">
        {visible.map((item) => (
          <DeliveryRow key={item._id} item={item} onOpen={() => setOpenId(item._id)} />
        ))}
      </ul>

      {open && (
        <LifecycleItemModal
          item={open}
          mergeTargets={items.filter((t) => t._id !== open._id && t.stage !== 'merged')}
          onAction={(action) => void act(open._id, action)}
          onClose={() => setOpenId(null)}
          {...(actionError ? { error: actionError } : {})}
        />
      )}
    </section>
  );
}
