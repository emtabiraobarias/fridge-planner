'use client';
import { useInventory } from '../context/InventoryContext';
import { useMealPlan } from '../context/MealPlanContext';
import { useGroceryList } from '../context/GroceryListContext';
import { StatCard } from '../components/home/StatCard';
import { UseItUpBanner } from '../components/home/UseItUpBanner';
import { TonightCard } from '../components/home/TonightCard';
import { GroceryRunCard } from '../components/home/GroceryRunCard';
import { FreshPicksCard } from '../components/home/FreshPicksCard';
import { soonestExpiring, groceryProgress } from '../lib/home-summary';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function todayMeta(): string {
  const now = new Date();
  return `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

/**
 * The Home dashboard (spec 010 US5, design §4.1, `/home`). Every figure is a
 * read of state three app-level contexts already hold — `InventoryContext`
 * and `MealPlanContext` are mounted app-wide (`app/providers.tsx`),
 * `GroceryListContext` is mounted on this route only (`app/home/page.tsx`,
 * mirroring `app/grocery/page.tsx`) — so mounting this page triggers no fetch
 * beyond what that provider already issues, and issues **zero** recommendation
 * requests (FR-RS-020/021, SC-RS-005, SC-RS-006). `home-summary.ts` holds the
 * only two derived figures (soonest-expiring item, grocery checked/total);
 * the rest are direct context reads.
 */
export function HomePage(): React.JSX.Element {
  const { items, summary } = useInventory();
  const { plan } = useMealPlan();
  const { groceryList } = useGroceryList();

  const entries = plan?.entries ?? [];
  const groceryItems = groceryList?.items ?? [];
  const { checked, total } = groceryProgress(groceryItems);
  const soonest = soonestExpiring(items);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div>
        <p className="text-muted text-[13px]">{todayMeta()}</p>
        <h1 className="font-heading text-[30px] leading-[1.06] text-ink sm:text-[38px] xl:text-[40px]">
          Your kitchen at a glance
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-4">
        <StatCard label="expiring soon" value={summary.expiringSoon} tone="accent" />
        <StatCard label="meals planned" value={entries.length} tone="accent2" />
        <StatCard label="groceries in" value={`${checked}/${total}`} tone="ink" />
        <StatCard label="items tracked" value={summary.total} tone="surface" />
      </div>

      <UseItUpBanner item={soonest} />

      <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
        <TonightCard entries={entries} />
        <GroceryRunCard items={groceryItems} />
        <FreshPicksCard items={items} />
      </div>
    </div>
  );
}
