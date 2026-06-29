import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { AuthProvider, useAuth, buildAuthorizeUrl } from '../../src/context/AuthContext';
import { getAuthToken } from '../../src/services/http';

function Harness(): React.JSX.Element {
  const { isAuthenticated, setToken, login } = useAuth();
  return (
    <div>
      <span data-testid="state">{isAuthenticated ? 'in' : 'out'}</span>
      <button onClick={() => setToken('abc')}>set</button>
      <button onClick={login}>login</button>
    </div>
  );
}

describe('buildAuthorizeUrl (E0)', () => {
  afterEach(() => {
    delete process.env['NEXT_PUBLIC_OIDC_ISSUER'];
    delete process.env['NEXT_PUBLIC_OIDC_CLIENT_ID'];
    delete process.env['NEXT_PUBLIC_OIDC_REDIRECT_URI'];
  });

  it('builds the OIDC authorize URL from public env', () => {
    process.env['NEXT_PUBLIC_OIDC_ISSUER'] = 'https://issuer.example.com/';
    process.env['NEXT_PUBLIC_OIDC_CLIENT_ID'] = 'client-123';
    const url = new URL(buildAuthorizeUrl('http://localhost:3000'));
    expect(url.origin + url.pathname).toBe('https://issuer.example.com/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
  });
});

describe('AuthProvider (E0)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('setToken makes the user authenticated and syncs the token to the service layer', () => {
    render(<AuthProvider><Harness /></AuthProvider>);
    expect(screen.getByTestId('state')).toHaveTextContent('out');
    act(() => {
      screen.getByText('set').click();
    });
    expect(screen.getByTestId('state')).toHaveTextContent('in');
    expect(getAuthToken()).toBe('abc');
    expect(window.sessionStorage.getItem('fp_access_token')).toBe('abc');
  });

  it('login() redirects the browser to the authorize endpoint', () => {
    process.env['NEXT_PUBLIC_OIDC_ISSUER'] = 'https://issuer.example.com';
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost:3000', assign }, writable: true });
    render(<AuthProvider><Harness /></AuthProvider>);
    act(() => {
      screen.getByText('login').click();
    });
    expect(assign).toHaveBeenCalledWith(expect.stringContaining('https://issuer.example.com/authorize'));
    delete process.env['NEXT_PUBLIC_OIDC_ISSUER'];
  });
});
