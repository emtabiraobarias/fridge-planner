'use client';
import { useEffect } from 'react';
import { usePipeline } from '../../context/PipelineContext';
import type { ArtifactType, PipelineItemSummary, PipelineStage, TransitionAction, TransitionRequest } from '../../services/pipeline';

const STAGE_LABELS: Record<PipelineStage, string> = {
  approved: 'Approved',
  'in-spec': 'In spec',
  'in-review': 'In review',
  shipped: 'Shipped',
  parked: 'Parked',
};

const STAGE_BADGE_CLASS: Record<PipelineStage, string> = {
  approved: 'bg-neutral-100 text-neutral-800',
  'in-spec': 'bg-accent2-100 text-accent2-800',
  'in-review': 'bg-accent-100 text-accent-800',
  shipped: 'bg-emerald-100 text-emerald-800',
  parked: 'bg-neutral-200 text-neutral-600',
};

// Decorative, shape-distinct-per-stage icon paths (aria-hidden). The stage is conveyed
// by the text label beside them — never by color alone (WCAG 2.1 AA, CLAUDE.md §7).
const STAGE_ICON_PATH: Record<PipelineStage, string> = {
  approved: 'M2 6 L5 9 L10 3',
  'in-spec': 'M2 9 L6 2 L10 9 Z',
  'in-review': 'M2 6 a4 2 0 1 0 8 0 a4 2 0 1 0 -8 0 Z M6 6 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0',
  shipped: 'M2 2 L10 6 L2 10 Z',
  parked: 'M4 2 v8 M8 2 v8',
};

function StageBadge({ stage, itemId }: { stage: PipelineStage; itemId: string }): React.JSX.Element {
  return (
    <span
      data-testid={`stage-badge-${itemId}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_BADGE_CLASS[stage]}`}
    >
      <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" className="shrink-0">
        <path d={STAGE_ICON_PATH[stage]} stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
      {STAGE_LABELS[stage]}
    </span>
  );
}

const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  'draft-spec': 'Draft spec',
  'pull-request': 'Pull request',
};

interface ActionButton {
  action: TransitionAction;
  label: string;
}

/** Which named actions are legal from `stage` (D3) — drives the visible controls. */
function actionsFor(stage: PipelineStage): ActionButton[] {
  switch (stage) {
    case 'approved':
      return [
        { action: 'advance', label: 'Advance' },
        { action: 'park', label: 'Park' },
      ];
    case 'in-spec':
      return [
        { action: 'approve-spec', label: 'Approve spec' },
        { action: 'park', label: 'Park' },
      ];
    case 'in-review':
      return [
        { action: 'approve-release', label: 'Approve release' },
        { action: 'park', label: 'Park' },
      ];
    case 'parked':
      return [{ action: 'reopen', label: 'Reopen' }];
    case 'shipped':
      return [];
  }
}

/** Builds the Zod-shaped PATCH body for a status-view control click. */
function buildRequest(action: TransitionAction): TransitionRequest {
  switch (action) {
    case 'advance':
    case 'approve-spec':
    case 'approve-release':
      return { action };
    case 'park':
      return { action: 'park' };
    case 'reopen':
      return { action: 'reopen' };
    case 'attach-artifact':
      // Never offered by actionsFor() — attaching an artifact is not a status-view action.
      throw new Error('attach-artifact is not available from the status view');
  }
}

interface RowProps {
  item: PipelineItemSummary;
  onTransition: (id: string, action: TransitionAction) => void;
}

function PipelineRow({ item, onTransition }: RowProps): React.JSX.Element {
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink">{item.sourceTitle}</p>
        <p className="text-muted text-xs">
          {item.sourceType} · {item.sourceAffectedArea}
        </p>
        {item.artifacts.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-2">
            {item.artifacts.map((a, i) => (
              <li key={`${a.type}-${i}`}>
                <a
                  href={a.ref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-accent hover:text-accent-600"
                >
                  {ARTIFACT_LABELS[a.type]}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <StageBadge stage={item.stage} itemId={item._id} />
        {actionsFor(item.stage).map((a) => (
          <button
            key={a.action}
            type="button"
            onClick={() => onTransition(item._id, a.action)}
            className="rounded-full border border-divider px-3 py-1 text-xs font-semibold text-ink hover:bg-ink/[0.07]"
          >
            {a.label}
          </button>
        ))}
      </div>
    </li>
  );
}

/** DL3 status view: the maintainer's promoted records with stage + artifact links (FR-F-015). */
export function PipelineStatusView(): React.JSX.Element {
  const { items, loading, refresh, transition } = usePipeline();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function handleTransition(id: string, action: TransitionAction): void {
    void transition(id, buildRequest(action));
  }

  return (
    <section className="mt-8" aria-label="Development pipeline">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-heading text-h5 text-ink">Development pipeline</h2>
        <button onClick={() => void refresh()} className="text-sm font-semibold text-accent hover:text-accent-600">
          Refresh
        </button>
      </div>

      {loading && <p className="text-muted text-sm">Loading…</p>}
      {!loading && items.length === 0 && <p className="text-muted text-sm">No promoted records yet.</p>}

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <PipelineRow key={item._id} item={item} onTransition={handleTransition} />
        ))}
      </ul>
    </section>
  );
}
