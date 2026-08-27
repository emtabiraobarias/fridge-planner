'use client';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  /** Wired to `aria-labelledby` — the caller's heading must carry this id. */
  titleId: string;
  /**
   * A roomier desktop dialog for content that does not fit 460px — the lifecycle item detail,
   * whose clause vetting puts each clause beside the record text it came from. Touch is
   * unaffected: a bottom sheet is already full-width, so there is nothing to widen.
   */
  wide?: boolean;
  children: ReactNode;
}

// Design §5.1 — one shared sheet/dialog shell, presentation by CSS ONLY: every
// class below is always present in the DOM; the `dlg:` variants are what make it
// a centred dialog on a real pointer instead of a bottom sheet. There is no JS
// branch on the viewport here (research D5) — that is what lets an orientation change
// swap sheet ↔ dialog without unmounting the panel, so state and the trapped
// focus both survive (the spec's orientation-change edge case).
// `overlay-scrim`/`overlay-panel` are plain marker classes (not Tailwind
// utilities) so `prefers-reduced-motion` can force off the entrance animation
// from one place in src/index.css regardless of which Tailwind animate-[...]
// utility is in play (FR-RS-025).
// `grid-cols-1 grid-rows-1` + `justify-stretch` on touch, NOT a bare `justify-center`.
//
// Both of the panel's percentage sizes resolve against their grid track, and an implicit track
// is sized by its content — so `w-full` and `max-h-[88%]` were circular and silently ignored.
// A sheet with narrow content rendered as a narrow floating box, and one with tall content grew
// past the bottom of the screen instead of scrolling inside itself. Pinning both tracks to the
// scrim (which is `inset-0`, so viewport-sized) makes the percentages resolve against the
// viewport, which is what they always meant. Desktop restores centring, where the panel's width
// is explicit and there is no circularity to begin with.
const SCRIM_CLASS = [
  'overlay-scrim fixed inset-0 z-50 grid grid-cols-1 grid-rows-1',
  'items-end justify-stretch bg-neutral-900/45 px-0',
  'transition-opacity duration-[180ms]',
  'dlg:items-center dlg:justify-center dlg:px-4',
].join(' ');

const PANEL_CLASS = [
  // touch: full-width bottom sheet, top corners only, grab-handle padding
  'overlay-panel relative w-full max-h-[88%] overflow-auto rounded-t-[30px] bg-bg p-[14px_22px_40px] shadow-lg',
  'animate-[overlay-sheet-in_260ms_cubic-bezier(.22,.61,.36,1)]',
  // desktop: centred dialog, all corners rounded
  'dlg:max-h-[88%] dlg:rounded-[28px] dlg:p-[26px]',
  'dlg:animate-[overlay-dialog-in_200ms_ease-out]',
].join(' ');

// Both widths are written out in full rather than composed, so Tailwind sees complete class
// names — a constructed `dlg:w-[min(${n}px,90%)]` would never be emitted.
const WIDTH_CLASS = 'dlg:w-[min(460px,90%)]';
const WIDE_WIDTH_CLASS = 'dlg:w-[min(760px,92%)]';

/**
 * Shared overlay shell (research D5, FR-RS-023): bottom sheet on touch / centred
 * dialog on desktop, a click-to-dismiss scrim, Escape-to-close, a hand-rolled
 * focus trap with restoration (`useFocusTrap`), and the required dialog
 * semantics. `createPortal`s to `document.body` so stacking context never
 * fights a scroll-clipped ancestor.
 */
export function Overlay({
  open,
  onClose,
  titleId,
  wide = false,
  children,
}: OverlayProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return (): void => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-testid="overlay-scrim"
      className={SCRIM_CLASS}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${PANEL_CLASS} ${wide ? WIDE_WIDTH_CLASS : WIDTH_CLASS}`}
      >
        <span
          data-testid="overlay-grab-handle"
          aria-hidden="true"
          className="mx-auto mb-[14px] block h-[5px] w-[42px] rounded-full bg-divider dlg:hidden"
        />
        {children}
      </div>
    </div>,
    document.body,
  );
}
