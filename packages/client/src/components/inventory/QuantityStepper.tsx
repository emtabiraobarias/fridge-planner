'use client';
import { stepFor } from '../../lib/quick-parse';

interface Props {
  quantity: number;
  unit: string;
  /** Called with the signed step (+step / −step) sized for the unit. */
  onStep: (delta: number) => void;
  name: string;
}

/** Cream pill with round −/+ buttons around a unit-aware quantity (spec 004 §3.1). */
export function QuantityStepper({ quantity, unit, onStep, name }: Props): React.JSX.Element {
  const step = stepFor(unit);
  return (
    <div className="flex items-center gap-1 rounded-full bg-bg p-[3px]">
      <button
        type="button"
        aria-label={`Decrease ${name}`}
        onClick={() => onStep(-step)}
        className="grid h-[30px] w-[30px] place-items-center rounded-full text-lg leading-none text-ink hover:bg-neutral-200"
      >
        −
      </button>
      <span className="min-w-[44px] text-center text-[13px] font-semibold tabular-nums">
        {quantity} {unit}
      </span>
      <button
        type="button"
        aria-label={`Increase ${name}`}
        onClick={() => onStep(step)}
        className="grid h-[30px] w-[30px] place-items-center rounded-full text-lg leading-none text-ink hover:bg-neutral-200"
      >
        +
      </button>
    </div>
  );
}
