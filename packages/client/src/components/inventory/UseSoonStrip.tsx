'use client';
import { Clock } from 'lucide-react';
import { urgentLabel } from '../../lib/quick-parse';

export interface UrgentItem {
  id: string;
  name: string;
  daysLeft: number | null;
}

interface Props {
  items: UrgentItem[];
  onCookThese: () => void;
}

/** Shows when any item expires within two days (spec 004 §3.1). Renders nothing otherwise. */
export function UseSoonStrip({ items, onCookThese }: Props): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-100 px-[18px] py-3">
      <Clock size={18} strokeWidth={2.75} className="text-accent-700" aria-hidden />
      <span className="text-[13px] font-bold text-accent-800">Use soon:</span>
      {items.map((it) => (
        <span key={it.id} className="rounded-full bg-bg px-2.5 py-1 text-[13px] text-accent-800">
          {it.name} · {urgentLabel(it.daysLeft)}
        </span>
      ))}
      <button
        type="button"
        onClick={onCookThese}
        className="ml-auto text-[13px] font-semibold text-accent hover:text-accent-600"
      >
        Cook these →
      </button>
    </div>
  );
}
