'use client';
import { Check } from 'lucide-react';
import type { GroceryListItem } from '../../types/grocery-list';

interface GroceryListItemRowProps {
  item: GroceryListItem;
  onTogglePurchased: (itemId: string, current: boolean) => void;
  onRemove: (itemId: string) => void;
  /** Whether this is the last row in its group (suppresses the divider). */
  last?: boolean;
}

/** Organic grocery row: round terracotta check, name (+ source), qty tag, remove (spec 004 §3.4). */
export function GroceryListItemRow({
  item,
  onTogglePurchased,
  onRemove,
  last = false,
}: GroceryListItemRowProps): React.JSX.Element {
  return (
    <li className={`flex items-center gap-3 px-1.5 py-[11px] ${last ? '' : 'border-b border-divider'}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={item.isPurchased}
        aria-label={`Mark ${item.displayName} as purchased`}
        onClick={() => onTogglePurchased(item._id, item.isPurchased)}
        className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-2 transition-colors ${
          item.isPurchased ? 'border-accent bg-accent text-bg' : 'border-neutral-400 text-transparent'
        }`}
      >
        <Check size={15} strokeWidth={3.5} aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={`text-[14.5px] font-semibold ${
            item.isPurchased ? 'text-ink/45 line-through' : 'text-ink'
          }`}
        >
          {item.displayName}
        </div>
        {item.sourceMealNames.length > 0 && (
          <div className="text-muted text-[11.5px]">for {item.sourceMealNames.join(', ')}</div>
        )}
      </div>

      <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] text-neutral-800">
        {item.quantity} {item.unit}
      </span>

      <button
        type="button"
        aria-label={`Remove ${item.displayName}`}
        onClick={() => onRemove(item._id)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink/60 hover:bg-neutral-200"
      >
        ×
      </button>
    </li>
  );
}
