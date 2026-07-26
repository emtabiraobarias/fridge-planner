interface ProgressRingProps {
  /** Number of rows already purchased (`purchased.length`, `GroceryListPage.tsx:139`). */
  checked: number;
  /** Total rows on the list (`items.length`, `GroceryListPage.tsx:138`). */
  total: number;
}

/**
 * 72px conic-gradient shopping-progress ring with an inset `checked/total` figure
 * (spec 010 design §4.4.2, FR-RS-016).
 *
 * Non-colour-only (SC-RS accessibility punch list): the ring pairs its fill with a
 * visible `checked/total` figure and exposes `role="progressbar"` with numeric
 * `aria-valuenow`/`aria-valuemin`/`aria-valuemax` plus an accessible name, so the
 * state is legible without relying on the gradient colour alone.
 */
export function ProgressRing({ checked, total }: ProgressRingProps): React.JSX.Element {
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;

  return (
    <div
      role="progressbar"
      aria-label="Shopping progress"
      aria-valuenow={checked}
      aria-valuemin={0}
      aria-valuemax={total}
      // `.progress-ring` (src/index.css) supplies the conic-gradient fill; `--pct`
      // is the only per-render value (see the class's doc comment for why the
      // gradient itself isn't set as an inline style).
      className="progress-ring relative grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full"
      style={{ '--pct': `${pct}%` } as React.CSSProperties}
    >
      <div className="grid h-[54px] w-[54px] place-items-center rounded-full bg-bg">
        <span className="font-heading text-[17px] font-semibold text-ink">
          {checked}/{total}
        </span>
      </div>
    </div>
  );
}
