import { useEffect, useRef } from 'react';
import type { MealPlanEntry } from '../../types/meal-plan';

interface MealDetailModalProps {
  entry: MealPlanEntry | null;
  onClose: () => void;
}

export function MealDetailModal({ entry, onClose }: MealDetailModalProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);

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
                  {ing}
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

        {meal.recipeUrl && (
          <a
            href={meal.recipeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline"
          >
            View Recipe →
          </a>
        )}
      </div>
    </div>
  );
}
