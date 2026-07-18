'use client';
import { useState } from 'react';
import type { ConsumptionReviewLine } from '../../lib/consumption-review';

interface ConsumptionReviewSheetProps {
  mealName: string;
  lines: ConsumptionReviewLine[];
  unresolvedNames: string[];
  onConfirm: (lines: ConsumptionReviewLine[]) => void;
  onCancel: () => void;
}

export function ConsumptionReviewSheet({
  mealName,
  lines,
  unresolvedNames,
  onConfirm,
  onCancel,
}: ConsumptionReviewSheetProps): React.JSX.Element {
  const [draft, setDraft] = useState<ConsumptionReviewLine[]>(lines);

  function updateQuantity(inventoryItemId: string, quantity: number): void {
    setDraft((current) =>
      current.map((line) =>
        line.inventoryItemId === inventoryItemId ? { ...line, quantity: Math.max(0, quantity) } : line,
      ),
    );
  }

  return (
    <section className="mt-5 rounded-lg border border-divider bg-cream/60 p-4" aria-label="Consumption review">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink">Mark cooked</h3>
        <p className="text-xs text-muted">Confirm what you actually used for {mealName}.</p>
      </div>

      <div className="space-y-3">
        {draft.map((line) => (
          <label
            key={line.inventoryItemId}
            className="flex min-h-11 items-center justify-between gap-3 text-sm"
          >
            <span className="font-medium text-ink">{line.name}</span>
            <span className="flex items-center gap-2">
              <input
                aria-label={`${line.name} amount`}
                type="number"
                min="0"
                step="0.01"
                value={line.quantity}
                onChange={(e) => updateQuantity(line.inventoryItemId, Number(e.currentTarget.value))}
                className="h-11 w-24 rounded-md border border-divider bg-white px-3 text-right text-sm"
              />
              <span className="min-w-10 text-xs text-muted">{line.unit}</span>
            </span>
          </label>
        ))}
      </div>

      {unresolvedNames.length > 0 && (
        <div className="mt-3 rounded-md bg-white/70 p-3 text-xs text-muted">
          Not from your kitchen: {unresolvedNames.join(', ')}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-md border border-divider px-4 text-sm font-medium text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(draft)}
          className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-white"
        >
          Confirm
        </button>
      </div>
    </section>
  );
}
