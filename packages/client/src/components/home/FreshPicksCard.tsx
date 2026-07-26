import { daysLeft, expiryStatus, type ExpiryStatus } from '../../lib/quick-parse';
import type { InventoryItem } from '../../services/inventory';

interface FreshPicksCardProps {
  items: InventoryItem[];
}

const DOT_CLASS: Record<ExpiryStatus, string> = {
  expired: 'bg-accent-600',
  soon: 'bg-accent',
  fresh: 'bg-accent2-500',
};
/** Design §4.2.3's "quantity is 0" neutral dot, reused here for the same state. */
const ZERO_DOT_CLASS = 'bg-neutral-400';

/**
 * Home's "Fresh picks" card (spec 010 US5, design §4.1.4): the first 3
 * inventory items, straight from `InventoryContext` — no fetch of its own
 * (FR-RS-020), and no re-derivation of expiry status beyond the shared
 * `quick-parse` helpers every other inventory view already uses.
 */
export function FreshPicksCard({ items }: FreshPicksCardProps): React.JSX.Element {
  const picks = items.slice(0, 3);

  return (
    <div className="rounded-[22px] bg-surface p-[17px]">
      <h2 className="font-heading text-[19px] text-ink">Fresh picks</h2>

      {picks.length === 0 ? (
        <p className="text-muted mt-3 text-[13px]">No items tracked yet — add something to your fridge.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {picks.map((item) => {
            const isZero = item.quantity <= 0;
            const dotClass = isZero ? ZERO_DOT_CLASS : DOT_CLASS[expiryStatus(daysLeft(item.expiresAt))];
            return (
              <li key={item._id} className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">
                  {item.name}
                </span>
                <span className="text-muted shrink-0 text-[12px]">
                  {item.quantity} {item.unit}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
