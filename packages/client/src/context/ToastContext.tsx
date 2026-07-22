'use client';
import { createContext, useContext, useState, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';

/** Optional reversible action shown alongside the toast (spec 009 research D7). */
export interface ToastAction {
  label: string;
  onAction: () => void;
}

interface ToastContextValue {
  toast: string;
  action: ToastAction | null;
  showToast: (message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 2600;

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [toast, setToast] = useState('');
  const [action, setAction] = useState<ToastAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, nextAction?: ToastAction): void => {
    setToast(message);
    setAction(nextAction ?? null);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToast('');
      setAction(null);
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ toast, action, showToast }}>{children}</ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

/** Non-throwing variant for presentational components/tests outside a provider. */
export function useToastOptional(): ToastContextValue | null {
  return useContext(ToastContext);
}
