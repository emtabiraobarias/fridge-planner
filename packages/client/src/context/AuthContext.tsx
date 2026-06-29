'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setAuthToken } from '../services/http';

// E0 (Phase E): client-side OIDC token holding + login/logout. The browser obtains an
// access token and the service layer attaches it as a Bearer header (see http.apiFetch),
// so requests are authenticated under AUTH_MODE=oidc.
//
// E0a (here): token store + authorize-URL redirect + the AuthBanner sign-in wiring.
// E0b (needs a live IdP — Phase E3): the /auth/callback code→token (PKCE) exchange that
// calls setToken(). Until then, login() initiates the redirect; tokens can also be injected
// via setToken (e.g. a test/dev token) so the seam is exercisable now.

const STORAGE_KEY = 'fp_access_token';

interface AuthState {
  accessToken: string | null;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
  setToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Build the OIDC authorization-endpoint URL from the public client config (NEXT_PUBLIC_OIDC_*). */
export function buildAuthorizeUrl(origin: string): string {
  const issuer = (process.env['NEXT_PUBLIC_OIDC_ISSUER'] ?? '').replace(/\/$/, '');
  const params = new URLSearchParams({
    client_id: process.env['NEXT_PUBLIC_OIDC_CLIENT_ID'] ?? '',
    redirect_uri: process.env['NEXT_PUBLIC_OIDC_REDIRECT_URI'] ?? `${origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid profile',
  });
  return `${issuer}/authorize?${params.toString()}`;
}

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Hydrate from sessionStorage on mount.
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.sessionStorage.getItem(STORAGE_KEY) : null;
    if (stored) setAccessToken(stored);
  }, []);

  // Keep the service layer's token in sync.
  useEffect(() => {
    setAuthToken(accessToken);
  }, [accessToken]);

  function setToken(token: string | null): void {
    setAccessToken(token);
    if (typeof window === 'undefined') return;
    if (token) window.sessionStorage.setItem(STORAGE_KEY, token);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  }

  function login(): void {
    if (typeof window !== 'undefined') {
      window.location.assign(buildAuthorizeUrl(window.location.origin));
    }
  }

  function logout(): void {
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ accessToken, isAuthenticated: accessToken !== null, login, logout, setToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
