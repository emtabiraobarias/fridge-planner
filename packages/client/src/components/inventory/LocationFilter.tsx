'use client';

export type LocationFilterValue = 'All' | 'Fridge' | 'Freezer' | 'Pantry';

const OPTIONS: readonly LocationFilterValue[] = ['All', 'Fridge', 'Freezer', 'Pantry'];

interface Props {
  value: LocationFilterValue;
  onChange: (value: LocationFilterValue) => void;
  visibleCount: number;
  totalCount: number;
}

/** Segmented control + right-aligned item count (spec 004 §3.1). */
export function LocationFilter({ value, onChange, visibleCount, totalCount }: Props): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <div
        role="group"
        aria-label="Filter by location"
        className="inline-flex overflow-hidden rounded-full border border-divider"
      >
        {OPTIONS.map((opt, i) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt)}
              className={`px-3 py-[7px] text-[13px] ${i > 0 ? 'border-l border-divider' : ''} ${
                active ? 'bg-accent text-bg' : 'text-ink hover:bg-ink/[0.07]'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      <span className="text-muted text-[13px]">
        {visibleCount} of {totalCount} items
      </span>
    </div>
  );
}
