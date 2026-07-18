import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { entryStatus, type MealPlanEntry } from '../../types/meal-plan';
import { groundedAmounts, withGroundedAmount } from '../../lib/grounded-ingredients';
import { buildReviewLines, type ConsumptionReviewLine } from '../../lib/consumption-review';
import { useInventoryOptional } from '../../context/InventoryContext';
import { MealPlanContext } from '../../context/MealPlanContext';
import { ConsumptionReviewSheet } from './ConsumptionReviewSheet';

interface MealDetailModalProps {
  entry: MealPlanEntry | null;
  onClose: () => void;
}

interface CookControlsProps {
  mealName: string;
  lines: ConsumptionReviewLine[];
  unresolvedNames: string[];
  submitting: boolean;
  onConfirm: (lines: ConsumptionReviewLine[]) => void;
}

function RecipeLink({ url }: { url: string | undefined }): React.JSX.Element | null {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
    >
      View Recipe →
    </a>
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
      <h3 className="text-sm font-semibold text-gray-700 mb-1">
        Consumed when cooked
        {cookedAt && (
          <span className="ml-2 font-normal text-gray-500">
            ({new Date(cookedAt).toLocaleString()})
          </span>
        )}
      </h3>
      <ul className="text-xs text-gray-600">
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

function CookControls({
  mealName,
  lines,
  unresolvedNames,
  submitting,
  onConfirm,
}: CookControlsProps): React.JSX.Element {
  const [reviewOpen, setReviewOpen] = useState(false);

  if (!reviewOpen) {
    return (
      <button
        type="button"
        onClick={() => setReviewOpen(true)}
        className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-white"
      >
        Mark cooked
      </button>
    );
  }

  return (
    <>
      <ConsumptionReviewSheet
        mealName={mealName}
        lines={lines}
        unresolvedNames={unresolvedNames}
        onConfirm={onConfirm}
        onCancel={() => setReviewOpen(false)}
      />
      {submitting && <p className="mt-2 text-xs text-muted">Updating kitchen inventory…</p>}
    </>
  );
}

export function MealDetailModal({ entry, onClose }: MealDetailModalProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inventory = useInventoryOptional();
  const mealPlan = useContext(MealPlanContext);
  const [submitting, setSubmitting] = useState(false);
  const review = useMemo(
    () => (entry ? buildReviewLines(entry.meal, inventory?.items ?? []) : { lines: [], unresolved: [] }),
    [entry, inventory?.items],
  );

  useEffect(() => {
    if (!entry) return;

    function handleKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return (): void => document.removeEventListener('keydown', handleKey);
  }, [entry, onClose]);

  if (!entry) return null;

  const { meal } = entry;
  const amounts = groundedAmounts(meal);
  const cooked = entryStatus(entry) === 'cooked';

  async function confirmCook(lines: ConsumptionReviewLine[]): Promise<void> {
    if (!mealPlan || !entry) return;
    const slotId = entry.slotId;
    setSubmitting(true);
    try {
      await mealPlan.cookMeal(slotId, lines);
      await inventory?.refresh();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative z-10 w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl max-h-[90vh]"
      >
        <button
          type="button"
          aria-label="Close"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 focus:outline-none"
          onClick={onClose}
        >
          ×
        </button>

        <h2 id="modal-title" className="text-xl font-bold text-gray-900 pr-6">
          {meal.mealName}
        </h2>

        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-800">
            {meal.cuisine}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
            {meal.prepTimeMinutes} min
          </span>
          {cooked && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">
              Cooked
            </span>
          )}
        </div>

        <p className="mt-3 text-sm text-gray-600">{meal.description}</p>

        {meal.usesIngredients.length > 0 && (
          <section className="mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">You have</h3>
            <ul className="flex flex-wrap gap-1">
              {meal.usesIngredients.map((ing) => (
                <li
                  key={ing}
                  className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800"
                >
                  {withGroundedAmount(ing, amounts)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {meal.expiringIngredients.length > 0 && (
          <section className="mt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Expiring soon</h3>
            <ul className="flex flex-wrap gap-1">
              {meal.expiringIngredients.map((ing) => (
                <li
                  key={ing}
                  className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800"
                >
                  {ing}
                </li>
              ))}
            </ul>
          </section>
        )}

        {meal.missingIngredients.length > 0 && (
          <section className="mt-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Need to buy</h3>
            <ul className="flex flex-wrap gap-1">
              {meal.missingIngredients.map((ing) => (
                <li
                  key={ing}
                  className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800"
                >
                  {ing}
                </li>
              ))}
            </ul>
          </section>
        )}

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

        {!cooked && mealPlan && (
          <div className="mt-5">
            <CookControls
              mealName={meal.mealName}
              lines={review.lines}
              unresolvedNames={review.unresolved}
              submitting={submitting}
              onConfirm={(lines) => {
                void confirmCook(lines);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
