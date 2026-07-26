'use client';
import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { QuickCaptureOverlay } from '../feedback/QuickCaptureOverlay';

/**
 * The always-present feedback affordance (FR-RS-006, design §2.3): a round bubble
 * at the four touch viewport classes, a labelled `Tell us` pill at desktop.
 *
 * Geometry is pure CSS so rotation never remounts it, and it is a sibling of
 * `<main>` inside `AppShell`, which is what makes it structurally unable to
 * scroll out of view (FR-RS-004).
 *
 * RS6 (T058): opens `QuickCaptureOverlay` instead of navigating directly — the
 * overlay's own "Open full feedback" link is what reaches `/feedback` now.
 * T061a removed the desktop sidebar's duplicate Feedback entry, so this is the
 * single feedback control per viewport (design §3, research D11).
 */
const AFFORDANCE_CLASS = [
  'fixed bottom-24 right-4 z-30 grid h-14 w-14 place-items-center gap-2',
  'rounded-full bg-accent text-bg shadow-lg transition-colors hover:bg-accent-600',
  // iPad portrait — 60×60 at right 26 / bottom 100
  'sm:bottom-[100px] sm:right-[26px] sm:h-[60px] sm:w-[60px]',
  // iPad landscape — 60×60 at right 24 / bottom 24
  'lg:bottom-6 lg:right-6 lg:h-[60px] lg:w-[60px]',
  // desktop — 54px `Tell us` pill at right 32 / bottom 32
  'xl:bottom-8 xl:right-8 xl:flex xl:h-[54px] xl:w-auto xl:items-center xl:px-[22px]',
  // phone landscape — 54×54 at right 16 / bottom 20. `phland:` last, matching its
  // declaration order in tailwind.config.ts (research D1).
  'phland:bottom-5 phland:right-4 phland:h-[54px] phland:w-[54px]',
].join(' ');

export function FeedbackAffordance(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Tell us — send feedback"
        onClick={() => setOpen(true)}
        className={AFFORDANCE_CLASS}
      >
        <MessageCircle size={24} strokeWidth={2.5} aria-hidden className="shrink-0" />
        <span className="hidden text-sm font-bold xl:inline">Tell us</span>
      </button>
      <QuickCaptureOverlay open={open} onClose={() => setOpen(false)} />
    </>
  );
}
