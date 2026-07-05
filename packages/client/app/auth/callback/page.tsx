'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../src/context/AuthContext';

// E0b: OIDC redirect landing. Reads the ?code & state from the IdP, exchanges the
// code for an access token (PKCE), then hard-navigates home so every context
// re-fetches with the Authorization: Bearer header attached.
export default function AuthCallbackPage(): React.JSX.Element {
  const { completeLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // auth codes are single-use; guard React strict-mode double-run
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const oidcError = params.get('error');
    const code = params.get('code');
    const state = params.get('state');
    if (oidcError) {
      setError(params.get('error_description') ?? oidcError);
      return;
    }
    if (!code || !state) {
      setError('Missing authorization code.');
      return;
    }
    completeLogin(code, state)
      .then(() => window.location.assign('/'))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Sign-in failed.'));
  }, [completeLogin]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-sm">
      {error ? (
        <div role="alert" className="max-w-md text-center text-red-700">
          <p className="font-medium">Sign-in failed</p>
          <p className="mt-1 text-red-600">{error}</p>
          <a href="/" className="mt-3 inline-block text-blue-700 underline">
            Return home
          </a>
        </div>
      ) : (
        <p className="text-gray-600">Signing you in…</p>
      )}
    </main>
  );
}
