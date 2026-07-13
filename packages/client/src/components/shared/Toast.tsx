'use client';
import { useToastOptional } from '../../context/ToastContext';

/** Single global toast, fixed above the bottom tab bar (spec 004 §3.6). */
export function Toast(): React.JSX.Element | null {
  const ctx = useToastOptional();
  if (!ctx || !ctx.toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[84px] left-1/2 z-50 -translate-x-1/2 rounded-full bg-accent2-800 px-6 py-[11px] text-sm text-accent2-100 shadow-lg"
    >
      {ctx.toast}
    </div>
  );
}
