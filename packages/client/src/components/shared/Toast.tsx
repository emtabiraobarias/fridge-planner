'use client';
import { Check } from 'lucide-react';
import { useToastOptional } from '../../context/ToastContext';

/** Single global toast, top-centre (spec 010 design §6, FR-RS-025 — supersedes the
 * shipped bottom-above-the-pill position from spec 004 §3.6). */
export function Toast(): React.JSX.Element | null {
  const ctx = useToastOptional();
  if (!ctx || !ctx.toast) return null;
  const action = ctx.action;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-[22px] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-neutral-900 px-[19px] py-[11px] text-[13px] font-bold text-bg shadow-lg"
    >
      <Check size={16} strokeWidth={3} className="shrink-0 text-accent2-400" aria-hidden />
      <span>{ctx.toast}</span>
      {action && (
        <button
          type="button"
          onClick={() => {
            action.onAction();
            ctx.showToast('');
          }}
          className="font-semibold underline underline-offset-2 hover:text-accent2-300"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
