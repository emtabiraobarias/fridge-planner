'use client';
import { useState } from 'react';
import type { ResolvedPurchaseInput } from '../../types/grocery-list';
import type { Location } from '../../services/inventory';

interface PurchasePromptSheetProps {
  itemName: string;
  quantity: number;
  unit: string;
  location: Location;
  suggestedExpiresAt?: string;
  onCancel: () => void;
  onConfirm: (payload: ResolvedPurchaseInput) => void;
}

function expiryToIso(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

export function PurchasePromptSheet({
  itemName,
  quantity,
  unit,
  location,
  suggestedExpiresAt,
  onCancel,
  onConfirm,
}: PurchasePromptSheetProps): React.JSX.Element {
  const [resolvedQuantity, setResolvedQuantity] = useState(String(quantity));
  const [resolvedUnit, setResolvedUnit] = useState(unit);
  const [resolvedLocation, setResolvedLocation] = useState<Location>(location);
  const [expiresAt, setExpiresAt] = useState<string | undefined>(undefined);

  function handleConfirm(): void {
    const parsedQuantity = Number(resolvedQuantity);
    const payload: ResolvedPurchaseInput = {
      quantity: Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : quantity,
      unit: resolvedUnit.trim() || unit,
      location: resolvedLocation,
      ...(expiresAt ? { expiresAt: expiryToIso(expiresAt) } : {}),
    };
    onConfirm(payload);
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-ink/30 px-3 py-4 sm:place-items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-prompt-title"
        className="w-full max-w-[420px] rounded-lg bg-bg p-4 shadow-xl"
      >
        <h2 id="purchase-prompt-title" className="font-heading text-h4 text-ink">
          Add {itemName}
        </h2>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-[13px] font-semibold text-ink">
            Quantity
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={resolvedQuantity}
              onChange={(event) => setResolvedQuantity(event.target.value)}
              className="min-h-11 rounded-lg border border-divider bg-neutral-100 px-3 text-[15px] font-normal"
            />
          </label>

          <label className="grid gap-1 text-[13px] font-semibold text-ink">
            Unit
            <input
              type="text"
              value={resolvedUnit}
              onChange={(event) => setResolvedUnit(event.target.value)}
              className="min-h-11 rounded-lg border border-divider bg-neutral-100 px-3 text-[15px] font-normal"
            />
          </label>

          <label className="grid gap-1 text-[13px] font-semibold text-ink">
            Location
            <select
              value={resolvedLocation}
              onChange={(event) => setResolvedLocation(event.target.value as Location)}
              className="min-h-11 rounded-lg border border-divider bg-neutral-100 px-3 text-[15px] font-normal"
            >
              <option value="fridge">fridge</option>
              <option value="freezer">freezer</option>
              <option value="pantry">pantry</option>
            </select>
          </label>

          {suggestedExpiresAt && (
            <button
              type="button"
              onClick={() => setExpiresAt(suggestedExpiresAt)}
              className="min-h-10 rounded-full border border-divider px-3 text-[13px] font-semibold hover:bg-ink/[0.07]"
            >
              Use expiry suggestion
            </button>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 rounded-full border border-divider px-4 text-[13px] font-semibold hover:bg-ink/[0.07]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="min-h-10 rounded-full bg-accent px-4 text-[13px] font-semibold text-bg hover:bg-accent-600"
          >
            Confirm
          </button>
        </div>
      </section>
    </div>
  );
}
