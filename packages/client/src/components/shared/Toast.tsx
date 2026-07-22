'use client';
import { useToastOptional } from '../../context/ToastContext';

/** Single global toast, fixed above the bottom tab bar (spec 004 §3.6). */
export function Toast(): React.JSX.Element | null {
  const ctx = useToastOptional();
  if (!ctx || !ctx.toast) return null;
  const action = ctx.action;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[84px] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-accent2-800 px-6 py-[11px] text-sm text-accent2-100 shadow-lg"
    >
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
