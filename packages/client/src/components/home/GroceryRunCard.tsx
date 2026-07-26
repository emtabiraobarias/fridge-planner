'use client';
import Link from 'next/link';
import { groceryProgress, hasNoGroceryItems, type PurchasableLike } from '../../lib/home-summary';

interface GroceryRunCardProps {
  items: PurchasableLike[];
}

/**
 * Home's "Grocery run" card (spec 010 US5, design §4.1.4). Reads
 * `GroceryListContext` only, via the shared `groceryProgress()` derivation
 * `GroceryListPage.tsx` also uses (research D6) — no fetch of its own
 * (FR-RS-020). The whole card links into the grocery list (FR-RS-022).
 */
export function GroceryRunCard({ items }: GroceryRunCardProps): React.JSX.Element {
  const { checked, total } = groceryProgress(items);
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  const empty = hasNoGroceryItems(total);

  return (
    <Link
      href="/grocery"
      className="block rounded-[22px] bg-surface p-[17px] hover:bg-neutral-100"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-[19px] text-ink">Grocery run</h2>
        {!empty && (
          <span className="text-[13px] font-bold text-accent2-700">
            {checked}/{total} in
          </span>
        )}
      </div>

      {empty ? (
        <p className="text-muted mt-3 text-[13px]">No grocery items yet — plan a meal to start a list.</p>
      ) : (
        <>
          <div className="mt-3 h-[10px] w-full rounded-full bg-neutral-200">
            <div
              className="h-[10px] rounded-full bg-accent2-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-muted mt-2 text-[13px]">Built from this week&rsquo;s meals</p>
        </>
      )}
    </Link>
  );
}
