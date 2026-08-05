'use client';
import { useEffect, useState } from 'react';
import { onAuthRequired } from '../../services/http';
import { useAuth } from '../../context/AuthContext';

/**
 * FR-D-009 / E0: surface an API `401` as a (re-)authentication prompt rather than a
 * generic error, with a Sign-in action that starts the OIDC login (AuthContext.login).
 * Subscribes to the auth-required signal emitted by the service layer.
 */
export function AuthBanner(): React.JSX.Element | null {
  const [needsAuth, setNeedsAuth] = useState(false);
  const { login } = useAuth();

  useEffect(() => onAuthRequired(() => setNeedsAuth(true)), []);

  if (!needsAuth) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 bg-accent-100 border-b border-accent-300 px-4 py-2 text-sm text-accent-800"
    >
      <span>Your session has expired — please sign in to continue.</span>
      <button
        type="button"
        onClick={login}
        className="rounded-md bg-accent-600 px-3 py-1 text-xs font-medium text-bg hover:bg-accent-700"
      >
        Sign in
      </button>
    </div>
  );
}
