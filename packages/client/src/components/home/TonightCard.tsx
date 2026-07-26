'use client';
import Link from 'next/link';
import type { MealPlanEntry } from '../../types/meal-plan';
import { todayUtcDate } from '../../lib/date-utils';

interface TonightCardProps {
  entries: MealPlanEntry[];
}

/** Today's dinner entry, if the meal plan has one (design §4.1.4 "Tonight"). */
function tonightsDinner(entries: MealPlanEntry[]): MealPlanEntry | null {
  const today = todayUtcDate();
  return (
    entries.find((e) => e.date.slice(0, 10) === today && e.mealType === 'dinner') ?? null
  );
}

/**
 * Home's "Tonight" card (spec 010 US5, design §4.1.4). Reads `MealPlanContext`
 * only — no fetch of its own (FR-RS-020) — and links into the meal plan
 * (FR-RS-022).
 */
export function TonightCard({ entries }: TonightCardProps): React.JSX.Element {
  const dinner = tonightsDinner(entries);

  return (
    <div className="rounded-[22px] bg-surface p-[17px]">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-[19px] text-ink">Tonight</h2>
        <Link href="/calendar" className="text-[13px] font-bold text-accent-700 hover:text-accent-800">
          Week →
        </Link>
      </div>

      {dinner ? (
        <div className="mt-3 rounded-[16px] bg-accent2-100 p-[14px]">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-accent2-700">
            {dinner.mealType}
          </p>
          <p className="text-[15px] font-bold text-accent2-900">
            {dinner.meal.mealName} · {dinner.meal.prepTimeMinutes} min
          </p>
        </div>
      ) : (
        <p className="text-muted mt-3 text-[13px]">Nothing planned for dinner tonight yet.</p>
      )}
    </div>
  );
}
