'use client';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useGroceryList } from '../context/GroceryListContext';
import { useInventory } from '../context/InventoryContext';
import { useMealPlan } from '../context/MealPlanContext';
import { useToast } from '../context/ToastContext';
import { GroceryListItemRow } from '../components/grocery/GroceryListItemRow';
import { parseQuick, parseQuickAll, type ParsedQuickItem } from '../lib/quick-parse';
import {
  applyOverrides,
  setOverride,
  type OverrideMap,
  type OverridableField,
} from '../lib/quick-add-overrides';
import { ParsePreview } from '../components/shared/ParsePreview';
import { useQuickAdd } from '../context/QuickAddContext';
import type { GroceryListItem, CompleteItemPayload, GroceryCategory } from '../types/grocery-list';
import { GROCERY_CATEGORIES } from '../types/grocery-list';

function weekLabel(weekStart: string): string {
  if (!weekStart) return '';
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Week of ${start.getUTCDate()}–${end.getUTCDate()} ${M[end.getUTCMonth()]}`;
}

const pluralS = (n: number): string => (n === 1 ? '' : 's');
const groceryUnit = (unit: string): string => (unit === 'count' ? 'servings' : unit);

/** Build the checkout payload that moves purchased items into inventory. */
function toCheckoutPayload(purchased: GroceryListItem[]): CompleteItemPayload[] {
  return purchased.map((i) => ({
    itemId: i._id,
    name: i.displayName,
    quantity: i.quantity,
    unit: i.unit,
    category: i.category,
    location: parseQuick(i.displayName)?.location ?? 'fridge',
  }));
}

export function GroceryListPage(): React.JSX.Element {
  const { groceryList, loading, error, generate, addItem, removeItem, togglePurchased, completeSession } =
    useGroceryList();
  const { refresh: refreshInventory } = useInventory();
  const { currentWeekStart } = useMealPlan();
  const { showToast } = useToast();

  const { enhance, recordCorrection } = useQuickAdd();
  const [generating, setGenerating] = useState(false);
  const [text, setText] = useState('');
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const enhanced = enhance(parseQuickAll(text));
  const { items: parsedPreview } = applyOverrides(enhanced, overrides);

  const items = groceryList?.items ?? [];
  const purchased = items.filter((i) => i.isPurchased);
  const pct = items.length ? Math.round((purchased.length / items.length) * 100) : 0;
  const categories = GROCERY_CATEGORIES.filter((c) => items.some((i) => i.category === c));

  async function handleGenerate(): Promise<void> {
    setGenerating(true);
    try {
      await generate();
    } finally {
      setGenerating(false);
    }
  }

  function handleCorrect(
    item: ParsedQuickItem,
    field: OverridableField,
    value: string | number | null,
  ): void {
    const base = enhanced.find((r) => r.name.toLowerCase() === item.name.toLowerCase());
    if (!base) return;
    setOverrides((m) => setOverride(m, base, field, value));
    recordCorrection(base, field, value);
  }

  async function handleQuickAdd(): Promise<void> {
    if (parsedPreview.length === 0) return;
    for (const p of parsedPreview) {
      await addItem({
        displayName: p.name,
        quantity: p.quantity,
        unit: groceryUnit(p.unit),
        category: p.category as GroceryCategory,
      });
    }
    setText('');
    setOverrides({});
  }

  async function handleCheckout(): Promise<void> {
    const count = purchased.length;
    const result = await completeSession(toCheckoutPayload(purchased));
    await refreshInventory();
    if (result.errors.length > 0) {
      showToast(`Some items could not be moved: ${result.errors.length} error(s)`);
      return;
    }
    showToast(`${count} item${pluralS(count)} moved into your kitchen`);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[720px] animate-pulse space-y-3 py-8">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-12 rounded-lg bg-surface" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="mx-auto max-w-[720px] rounded-lg bg-accent-100 p-4 text-sm text-accent-800">
        {error}
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-[18px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-h2 text-ink">Grocery list</h1>
          <p className="text-muted text-[13px]">{weekLabel(currentWeekStart)} · built from your meal plan</p>
        </div>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="flex items-center gap-1.5 rounded-full border border-divider px-4 py-2 text-[13px] hover:bg-ink/[0.07] disabled:opacity-60"
        >
          <RefreshCw size={14} strokeWidth={2.75} aria-hidden />
          {generating ? 'Regenerating…' : 'Regenerate'}
        </button>
      </div>

      {/* Progress */}
      {items.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-accent2-500 transition-[width] duration-300"
              style={{ width: `${pct}%` }}
              role="progressbar"
              aria-valuenow={purchased.length}
              aria-valuemax={items.length}
            />
          </div>
          <span className="text-[13px] font-semibold text-ink">
            {purchased.length}/{items.length} in the trolley
          </span>
        </div>
      )}

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-divider py-12 text-center">
          <p className="text-muted text-sm">No grocery items yet.</p>
          <p className="text-muted mt-1 text-xs">
            Plan meals for this week and tap Regenerate, or add something below.
          </p>
        </div>
      )}

      {/* Category groups */}
      {categories.map((cat) => {
        const rows = items.filter((i) => i.category === cat) as GroceryListItem[];
        return (
          <div key={cat}>
            <h2 className="text-h6 mb-1.5 font-body font-bold uppercase text-accent-700">{cat}</h2>
            <ul className="rounded-lg bg-surface px-2.5 py-1.5">
              {rows.map((item, i) => (
                <GroceryListItemRow
                  key={item._id}
                  item={item}
                  last={i === rows.length - 1}
                  onTogglePurchased={(id, cur) => void togglePurchased(id, cur)}
                  onRemove={(id) => void removeItem(id)}
                />
              ))}
            </ul>
          </div>
        );
      })}

      {/* Quick add */}
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="Add grocery item"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleQuickAdd();
          }}
          placeholder="Add something… e.g. 2 lemons, olive oil"
          className="min-h-[46px] flex-1 rounded-full bg-neutral-100 px-4 text-[15px] text-ink placeholder:text-muted"
        />
        <button
          type="button"
          onClick={() => void handleQuickAdd()}
          className="min-h-[46px] rounded-full border border-divider px-5 text-[13px] font-semibold hover:bg-ink/[0.07]"
        >
          Add
        </button>
      </div>

      {/* Tap-to-correct parse preview (spec 005 US2) — grocery items carry no location/expiry */}
      <ParsePreview items={parsedPreview} onCorrect={handleCorrect} showLocation={false} showExpiry={false} />

      {/* Inline checkout */}
      {purchased.length > 0 && (
        <button
          type="button"
          onClick={() => void handleCheckout()}
          className="min-h-[48px] w-full rounded-full bg-accent text-[15px] font-semibold text-bg hover:bg-accent-600"
        >
          Done shopping — move {purchased.length} item{pluralS(purchased.length)} into my kitchen
        </button>
      )}
    </div>
  );
}
