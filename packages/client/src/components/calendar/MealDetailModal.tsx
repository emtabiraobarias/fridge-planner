import { useContext, useMemo, useState } from 'react';
import { entryStatus, type MealPlanEntry } from '../../types/meal-plan';
import { groundedAmounts, withGroundedAmount } from '../../lib/grounded-ingredients';
import { useInventoryOptional } from '../../context/InventoryContext';
import { MealPlanContext } from '../../context/MealPlanContext';
import { Overlay } from '../shared/Overlay';

interface MealDetailModalProps {
  entry: MealPlanEntry | null;
  onClose: () => void;
  /**
   * Opens the promoted consumption-review overlay at the `CalendarPage` level
   * (research D5 — the cook flow is hoisted so the detail overlay closes as the
   * review overlay opens, and no overlay ever nests another). Omitted (or the
   * meal plan context being absent) hides the `Mark cooked` action entirely,
   * matching the shipped "requires a MealPlanProvider" gate.
   */
  onMarkCooked?: (entry: MealPlanEntry) => void;
}

function RecipeLink({ url }: { url: string | undefined }): React.JSX.Element | null {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-block text-sm font-medium text-accent2-700 hover:underline"
    >
      View Recipe →
    </a>
  );
}

function ChipSection({
  title,
  names,
  chipClass,
}: {
  title: string;
  names: string[];
  chipClass: string;
}): React.JSX.Element | null {
  if (names.length === 0) return null;
  return (
    <section className="mt-3">
      <h3 className="text-sm font-semibold text-ink mb-1">{title}</h3>
      <ul className="flex flex-wrap gap-1">
        {names.map((ing) => (
          <li key={ing} className={`rounded-full px-2 py-0.5 text-xs ${chipClass}`}>
            {ing}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface CookedReceiptProps {
  consumedItems: NonNullable<MealPlanEntry['consumedItems']>;
  cookedAt: string | undefined;
  canUncook: boolean;
  submitting: boolean;
  onUncook: () => void;
}

/** FR-MC-015: what this cook took from inventory, with the un-cook escape hatch. */
function CookedReceipt({
  consumedItems,
  cookedAt,
  canUncook,
  submitting,
  onUncook,
}: CookedReceiptProps): React.JSX.Element {
  return (
    <section className="mt-4">
      <h3 className="text-sm font-semibold text-ink mb-1">
        Consumed when cooked
        {cookedAt && (
          <span className="ml-2 font-normal text-muted">
            ({new Date(cookedAt).toLocaleString()})
          </span>
        )}
      </h3>
      <ul className="text-xs text-muted">
        {consumedItems.map((line) => (
          <li key={`${line.name}-${line.inventoryItemId ?? 'x'}`}>
            {line.name} —{' '}
            {line.quantityConsumed > 0 ? `${line.quantityConsumed} ${line.unit}` : 'not consumed'}
          </li>
        ))}
      </ul>
      {canUncook && (
        <button
          type="button"
          onClick={onUncook}
          disabled={submitting}
          className="mt-3 min-h-11 rounded-md border border-divider px-4 text-sm font-medium text-ink"
        >
          Un-cook (restore inventory)
        </button>
      )}
    </section>
  );
}

export function MealDetailModal({
  entry,
  onClose,
  onMarkCooked,
}: MealDetailModalProps): React.JSX.Element | null {
  const inventory = useInventoryOptional();
  const mealPlan = useContext(MealPlanContext);
  const [submitting, setSubmitting] = useState(false);
  const amounts = useMemo(
    () => (entry ? groundedAmounts(entry.meal) : new Map<string, string>()),
    [entry],
  );

  if (!entry) return null;

  const { meal } = entry;
  const cooked = entryStatus(entry) === 'cooked';

  async function confirmUncook(): Promise<void> {
    if (!mealPlan || !entry) return;
    const slotId = entry.slotId;
    setSubmitting(true);
    try {
      await mealPlan.uncookMeal(slotId);
      await inventory?.refresh();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Overlay open onClose={onClose} titleId="modal-title">
      <div className="relative">
        <button
          type="button"
          aria-label="Close"
          className="absolute top-0 right-0 text-muted hover:text-ink"
          onClick={onClose}
        >
          ×
        </button>

        <h2 id="modal-title" className="text-h4 font-heading text-ink pr-6">
          {meal.mealName}
        </h2>

        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-accent2-100 px-2 py-0.5 text-accent2-800">
            {meal.cuisine}
          </span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-ink">
            {meal.prepTimeMinutes} min
          </span>
          {cooked && (
            <span className="rounded-full bg-accent2-100 px-2 py-0.5 text-accent2-800">Cooked</span>
          )}
        </div>

        <p className="mt-3 text-sm text-muted">{meal.description}</p>

        {meal.usesIngredients.length > 0 && (
          <section className="mt-4">
            <h3 className="text-sm font-semibold text-ink mb-1">You have</h3>
            <ul className="flex flex-wrap gap-1">
              {meal.usesIngredients.map((ing) => (
                <li
                  key={ing}
                  className="rounded-full bg-accent2-100 px-2 py-0.5 text-xs text-accent2-800"
                >
                  {withGroundedAmount(ing, amounts)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <ChipSection
          title="Expiring soon"
          names={meal.expiringIngredients}
          chipClass="bg-accent-100 text-accent-800"
        />

        <ChipSection
          title="Need to buy"
          names={meal.missingIngredients}
          chipClass="bg-accent-100 text-accent-800"
        />

        <RecipeLink url={meal.recipeUrl} />

        {cooked && entry.consumedItems && (
          <CookedReceipt
            consumedItems={entry.consumedItems}
            cookedAt={entry.cookedAt}
            canUncook={Boolean(mealPlan)}
            submitting={submitting}
            onUncook={() => {
              void confirmUncook();
            }}
          />
        )}

        {!cooked && mealPlan && onMarkCooked && (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => onMarkCooked(entry)}
              className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-bg"
            >
              Mark cooked
            </button>
          </div>
        )}
      </div>
    </Overlay>
  );
}
