'use client';
import { useMemo } from 'react';
import type { LifecycleStage } from '../../services/lifecycle';

/**
 * The stage filter shared by Triage and Delivery (FR-AD-009, "filtering by status and
 * lifecycle stage").
 *
 * Shared rather than copied because the two tabs are two halves of ONE maintainer surface
 * (D7 / FR-FL-056) — a filter that behaved differently on each half would undo that as surely
 * as splitting them across screens would.
 */

export type StageFilterValue = LifecycleStage | 'draft' | 'all';

export const STAGE_LABEL: Record<string, string> = {
  draft: 'Draft',
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

/** Funnel order, so the chips read as a journey rather than an alphabetised set. */
export const STAGE_ORDER: Array<LifecycleStage | 'draft'> = [
  'draft',
  'new',
  'accepted',
  'briefed',
  'in-spec',
  'in-progress',
  'in-review',
  'shipped',
  'closed',
  'dismissed',
  'merged',
  'parked',
];

interface StageFilterProps {
  /** One entry per visible row, in any order — counts are derived here. */
  stages: Array<LifecycleStage | 'draft'>;
  value: StageFilterValue;
  onChange: (value: StageFilterValue) => void;
}

export function StageFilter({ stages, value, onChange }: StageFilterProps): React.JSX.Element {
  /** Only stages actually present get a chip — a filter that can only ever return nothing is
   *  noise, and there are twelve possible stages. */
  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stages) counts.set(s, (counts.get(s) ?? 0) + 1);
    return [
      { value: 'all' as StageFilterValue, label: 'All', count: stages.length },
      ...STAGE_ORDER.filter((s) => counts.has(s)).map((s) => ({
        value: s as StageFilterValue,
        label: STAGE_LABEL[s] ?? s,
        count: counts.get(s) ?? 0,
      })),
    ];
  }, [stages]);

  return (
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by stage">
      {chips.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          aria-pressed={value === c.value}
          className={`rounded-full px-4 py-2 text-[13px] font-semibold ${
            value === c.value ? 'bg-accent text-bg' : 'bg-accent-100 text-accent-800'
          }`}
        >
          {c.label} ({c.count})
        </button>
      ))}
    </div>
  );
}
