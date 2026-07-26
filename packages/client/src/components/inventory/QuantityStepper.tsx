'use client';
import { stepFor } from '../../lib/quick-parse';

interface Props {
  quantity: number;
  unit: string;
  /** Called with the signed step (+step / −step) sized for the unit. */
  onStep: (delta: number) => void;
  name: string;
}

// Design §4.2.3's stepper pill is visually compact (30px glyphs), but FR-RS-025 /
// SC-RS-003 require a 44px touch target in each dimension. `before:` extends the
// hit area 7px past every edge (30 + 2×7 = 44) via a pseudo-element — pseudo-
// elements participate in the parent's hit-testing box, so no extra DOM node or
// dependency is needed, and the ink stays the compact pill the design specifies.
const HIT_AREA = 'relative before:absolute before:-inset-[7px] before:content-[""]';

/** Cream pill with round −/+ buttons around a unit-aware quantity (spec 004 §3.1). */
export function QuantityStepper({ quantity, unit, onStep, name }: Props): React.JSX.Element {
  const step = stepFor(unit);
  return (
    <div className="flex items-center gap-1 rounded-full bg-bg p-[3px]">
      <button
        type="button"
        aria-label={`Decrease ${name}`}
        onClick={() => onStep(-step)}
        className={`grid h-[30px] w-[30px] place-items-center rounded-full text-lg leading-none text-ink hover:bg-neutral-200 ${HIT_AREA}`}
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
        className={`grid h-[30px] w-[30px] place-items-center rounded-full text-lg leading-none text-ink hover:bg-neutral-200 ${HIT_AREA}`}
      >
        +
      </button>
    </div>
  );
}
