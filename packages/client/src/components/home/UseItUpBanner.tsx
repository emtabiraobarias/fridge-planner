'use client';
import { useState } from 'react';
import { daysLeft, expiryText } from '../../lib/quick-parse';
import { RecommendationsPanel } from '../recommendations/RecommendationsPanel';
import type { InventoryItem } from '../../services/inventory';

interface UseItUpBannerProps {
  /** The soonest-expiring item (`home-summary.ts` `soonestExpiring()`), or
   * `null` when nothing in inventory carries an expiry date — the calm
   * alternative renders in that case (design §4.1.3 edge case). */
  item: InventoryItem | null;
}

/**
 * Home's "use it up first" banner (spec 010 US5, design §4.1.3, FR-RS-021).
 * Names the soonest-expiring item from already-fetched inventory data — it
 * must never issue a recommendation request on load (spec 009 FR-IR-001). The
 * "Cook this →" action is the one and only trigger for a scoped
 * recommendation request, reusing `009`'s `ingredientItemIds` scope verbatim
 * (research D6): no new endpoint, no new context. The "and it uses the whole
 * bunch" recipe pairing shown in the design handoff is illustrative — it can
 * only come from that on-tap call, never from a preloaded suggestion.
 */
export function UseItUpBanner({ item }: UseItUpBannerProps): React.JSX.Element {
  const [requested, setRequested] = useState(false);

  if (!item) {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-[24px] bg-accent-100 p-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-accent-700">
            Use it up first
          </p>
          <h2 className="font-heading text-[24px] text-accent-800">Nothing expiring soon</h2>
          <p className="mt-1 text-[14px] text-accent-800">
            Your fridge is looking fresh — nothing needs using up right now.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[24px] bg-accent-100 p-5">
      <div className="min-w-[220px] flex-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-accent-700">
          Use it up first
        </p>
        <h2 className="font-heading text-[24px] text-accent-800">
          {item.name} {expiryText(daysLeft(item.expiresAt))}
        </h2>
        <p className="mt-1 text-[14px] text-accent-800">
          {requested
            ? 'Here are some ideas that use it up:'
            : 'Tap Cook this for a recipe idea that uses it up.'}
        </p>
      </div>
      {!requested && (
        <button
          type="button"
          onClick={() => setRequested(true)}
          className="shrink-0 rounded-full bg-accent px-5 py-3 text-[14px] font-semibold text-bg hover:bg-accent-600"
        >
          Cook this →
        </button>
      )}
      {requested && (
        <div className="w-full">
          <RecommendationsPanel ingredientItemIds={[item._id]} autoFetch />
        </div>
      )}
    </div>
  );
}
