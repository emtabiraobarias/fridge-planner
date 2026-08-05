import type { ReactNode } from 'react';
import { Nav } from '../../../app/nav';
import { AccountPanel } from '../account/AccountPanel';
import { FeedbackAffordance } from './FeedbackAffordance';

/**
 * The application shell (spec 010 — design §1.3/§1.4, research D2).
 *
 * Two rules from the design are labelled "requirements, not suggestions" because
 * each was a real bug during design, and each maps to a success criterion:
 *
 *  1. **The root fills the viewport and `<main>` is the ONLY scroll container**
 *     (`h-dvh` + `flex-1 min-h-0 overflow-auto`), with `<Nav>` and
 *     `<FeedbackAffordance>` as siblings *outside* it. If the root were allowed
 *     to grow to content height, the nav would scroll away with the page
 *     (FR-RS-004, SC-RS-002). `dvh` rather than `vh`: mobile browser chrome makes
 *     `100vh` taller than the visible area.
 *  2. **`box-border` on the padded wrapper** — without it the §1.3 padding adds
 *     to a `width: 100%` box and overflows horizontally (SC-RS-001).
 *
 * The per-viewport padding lives here exactly once, so no view has to know about
 * the landscape nav rail's left inset. Padding is expressed in CSS breakpoints
 * rather than through `useViewportClass()`: zero hydration cost, zero JS on the
 * critical path.
 */
const CONTENT_CLASS = [
  // phone portrait — 54 / 16 / 116 (bottom clears the pill)
  'box-border w-full pt-[54px] px-4 pb-[116px]',
  // iPad portrait — 40 / 34 / 116
  'sm:pt-10 sm:px-[34px] sm:pb-[116px]',
  // iPad landscape — 40 / left 120 (clears the rail) / right 34 / 44
  'lg:pt-10 lg:pl-[120px] lg:pr-[34px] lg:pb-11',
  // desktop — 32 / 40 / 48, capped at 1120px and centred
  'xl:pt-8 xl:px-10 xl:pb-12 xl:max-w-content xl:mx-auto',
  // phone landscape — 30 / left 96 (clears the rail) / right 16 / 44.
  // `phland:` MUST come last (see tailwind.config.ts): at 844px wide `sm:` also
  // matches, and only the last-declared query wins at equal specificity.
  'phland:pt-[30px] phland:pl-24 phland:pr-4 phland:pb-11',
].join(' ');

export function AppShell({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg xl:flex-row">
      <Nav footer={<AccountPanel variant="compact" />} />
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        <div className={CONTENT_CLASS}>{children}</div>
      </main>
      <FeedbackAffordance />
    </div>
  );
}
