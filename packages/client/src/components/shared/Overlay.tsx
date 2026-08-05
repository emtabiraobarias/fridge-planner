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
  children: ReactNode;
}

// Design §5.1 — one shared sheet/dialog shell, presentation by CSS ONLY: every
// class below is always present in the DOM; the `xl:` variants are what make it
// a centred dialog on desktop instead of a bottom sheet. There is no JS branch
// on the viewport here (research D5) — that is what lets an orientation change
// swap sheet ↔ dialog without unmounting the panel, so state and the trapped
// focus both survive (the spec's orientation-change edge case).
// `overlay-scrim`/`overlay-panel` are plain marker classes (not Tailwind
// utilities) so `prefers-reduced-motion` can force off the entrance animation
// from one place in src/index.css regardless of which Tailwind animate-[...]
// utility is in play (FR-RS-025).
const SCRIM_CLASS = [
  'overlay-scrim fixed inset-0 z-50 grid items-end justify-center bg-neutral-900/45 px-0',
  'transition-opacity duration-[180ms]',
  'xl:items-center xl:px-4',
].join(' ');

const PANEL_CLASS = [
  // touch: full-width bottom sheet, top corners only, grab-handle padding
  'overlay-panel relative w-full max-h-[88%] overflow-auto rounded-t-[30px] bg-bg p-[14px_22px_40px] shadow-lg',
  'animate-[overlay-sheet-in_260ms_cubic-bezier(.22,.61,.36,1)]',
  // desktop: centred dialog, all corners rounded
  'xl:w-[min(460px,90%)] xl:max-h-[88%] xl:rounded-[28px] xl:p-[26px]',
  'xl:animate-[overlay-dialog-in_200ms_ease-out]',
].join(' ');

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
        className={PANEL_CLASS}
      >
        <span
          data-testid="overlay-grab-handle"
          aria-hidden="true"
          className="mx-auto mb-[14px] block h-[5px] w-[42px] rounded-full bg-divider xl:hidden"
        />
        {children}
      </div>
    </div>,
    document.body,
  );
}
