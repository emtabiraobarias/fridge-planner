'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  applyLifecycleAction,
  fetchQueue,
  type LifecycleAction,
  type LifecycleStage,
  type LifecycleSummary,
} from '../../services/lifecycle';
import { ClosureComposer } from './ClosureComposer';
import { ClauseVetting } from './ClauseVetting';

/**
 * Delivery — the second half of the maintainer surface (spec 012 US4, D7).
 *
 * Triage and delivery sit on ONE surface deliberately: splitting them would recreate the thing
 * `003` shipped, where an item's id appeared once at promotion and was never seen again.
 */

const STAGE_LABEL: Record<string, string> = {
  accepted: 'Accepted',
  briefed: 'Briefed',
  'in-spec': 'In spec',
  'in-progress': 'In progress',
  'in-review': 'In review',
  shipped: 'Shipped',
  parked: 'Parked',
};

interface Control {
  label: string;
  action: LifecycleAction;
  /** Gate approvals are visually distinct — they are the three moments a human must decide. */
  gate?: boolean;
}

/**
 * Which controls are legal from a stage. Mirrors `lib/lifecycle-stages.ts`; the SERVER remains
 * the authority, and an illegal action is refused there with 409 regardless of what renders
 * (FR-FL-054).
 */
function controlsFor(stage: LifecycleStage): Control[] {
  switch (stage) {
    case 'accepted':
      return [{ label: 'Brief it', action: { action: 'advance' } }];
    case 'briefed':
      return [{ label: 'Send to spec', action: { action: 'advance' } }];
    case 'in-spec':
      return [
        { label: 'Approve spec', action: { action: 'approve-spec' }, gate: true },
        { label: 'Reject spec', action: { action: 'reject-spec' } },
      ];
    case 'in-progress':
      return [{ label: 'Ready for review', action: { action: 'advance' } }];
    case 'in-review':
      return [
        { label: 'Approve release', action: { action: 'approve-release' }, gate: true },
        // FR-FL-064 — without this, review finding a problem has nowhere to send the work.
        { label: 'Changes needed', action: { action: 'reject-release' } },
      ];
    case 'parked':
      return [{ label: 'Reopen', action: { action: 'reopen' } }];
    case 'shipped':
      // Nothing auto-closes on merge or release (D9) — the maintainer closes explicitly.
      return [];
    default:
      return [];
  }
}

const DELIVERY_STAGES: LifecycleStage[] = [
  'accepted',
  'briefed',
  'in-spec',
  'in-progress',
  'in-review',
  'shipped',
  'parked',
];

export function DeliveryPanel(): React.JSX.Element {
  const [items, setItems] = useState<LifecycleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState<string | null>(null);

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
    setError('');
    try {
      await applyLifecycleAction(id, action);
      await refresh();
    } catch {
      setError('That action was refused. The item may have changed — refresh and try again.');
    }
  }

  return (
    <section aria-label="Delivery" className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-heading text-h5 text-ink">Delivery</h2>
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
        <p className="text-muted text-sm">Nothing in delivery.</p>
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
                {item.reporterErasedAt ? ' · reporter erased' : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid={`delivery-stage-${item._id}`}
                className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-800"
              >
                {STAGE_LABEL[item.stage] ?? item.stage}
              </span>

              {controlsFor(item.stage).map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => void act(item._id, c.action)}
                  className={
                    c.gate
                      ? 'rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-600'
                      : 'rounded-full border border-divider px-3 py-1 text-xs font-semibold text-ink hover:bg-ink/[0.07]'
                  }
                >
                  {c.label}
                </button>
              ))}

              {item.stage === 'shipped' && closing !== item._id && (
                <button
                  type="button"
                  onClick={() => setClosing(item._id)}
                  className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-600"
                >
                  Close
                </button>
              )}

              {item.stage !== 'parked' && item.stage !== 'shipped' && (
                <button
                  type="button"
                  onClick={() => void act(item._id, { action: 'park' })}
                  className="text-muted text-xs font-semibold hover:text-ink"
                >
                  Park
                </button>
              )}
            </div>

            {/* At `briefed` the clauses ARE the work — shown inline rather than behind a
                click, since advancing is blocked until they are vetted (FR-FL-028). */}
            {item.stage === 'briefed' && <ClauseVetting itemId={item._id} />}

            {closing === item._id && (
              <ClosureComposer
                sourceTitle={item.sourceTitle}
                onCancel={() => setClosing(null)}
                onClose={(action) => {
                  setClosing(null);
                  void act(item._id, action);
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
