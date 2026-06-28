'use client';
import { useEffect, useState } from 'react';
import { onAuthRequired } from '../../services/http';

/**
 * FR-D-009: surface an API `401` as a (re-)authentication prompt rather than a
 * generic error. Subscribes to the auth-required signal emitted by the service layer.
 * (The actual sign-in flow / IdP is out of scope for spec 002.)
 */
export function AuthBanner(): React.JSX.Element | null {
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => onAuthRequired(() => setNeedsAuth(true)), []);

  if (!needsAuth) return null;

  return (
    <div role="alert" className="bg-amber-50 border-b border-amber-300 px-4 py-2 text-sm text-amber-900">
      Your session has expired — please sign in to continue.
    </div>
  );
}
