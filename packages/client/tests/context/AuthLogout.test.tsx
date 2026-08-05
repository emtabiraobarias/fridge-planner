// T101-T105 — sign-out (spec 002 FR-D-011/014/015/016, plan D-S1).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth, endSessionUrl } from '../../src/context/AuthContext';

const ISSUER = 'https://auth.example.com/realms/fridge-planner';
const replace = vi.fn();

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_OIDC_ISSUER', ISSUER);
  vi.stubEnv('NEXT_PUBLIC_OIDC_CLIENT_ID', 'fridge-planner-app');
  replace.mockClear();
  Object.defineProperty(window, 'location', {
    value: { origin: 'https://app.example.com', replace, assign: vi.fn(), href: '' },
    writable: true,
    configurable: true,
  });
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('endSessionUrl (FR-D-011)', () => {
  it('targets the IdP end-session endpoint with a post-logout redirect back to the app', () => {
    const url = new URL(endSessionUrl('https://app.example.com')!);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/protocol/openid-connect/logout`);
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://app.example.com');
    expect(url.searchParams.get('client_id')).toBe('fridge-planner-app');
  });

  // null is the signal for the caller to take the FR-D-014 local-only path rather than
  // navigate somewhere meaningless.
  it('returns null when the issuer is not configured', () => {
    vi.stubEnv('NEXT_PUBLIC_OIDC_ISSUER', '');
    expect(endSessionUrl('https://app.example.com')).toBeNull();
  });
});

function signedIn() {
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  act(() => result.current.setToken('tok-123'));
  return result;
}

describe('logout (FR-D-011/014/016)', () => {
  it('clears the local session and navigates to the IdP end-session endpoint', () => {
    const result = signedIn();
    expect(window.sessionStorage.getItem('fp_access_token')).toBe('tok-123');

    act(() => result.current.logout());

    expect(window.sessionStorage.getItem('fp_access_token')).toBeNull();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.mock.calls[0]?.[0])).toContain('/protocol/openid-connect/logout');
  });

  // FR-D-014: the provider being unreachable must not leave the user signed in — and
  // this path must navigate too, or it would be the ONLY one that leaks state.
  it('still clears and hard-navigates when the IdP URL cannot be built', () => {
    vi.stubEnv('NEXT_PUBLIC_OIDC_ISSUER', '');
    const result = signedIn();

    act(() => result.current.logout());

    expect(window.sessionStorage.getItem('fp_access_token')).toBeNull();
    expect(replace).toHaveBeenCalledWith('/');
  });

  // FR-D-016 is satisfied BY the navigation: six data-holding providers sit under
  // AuthProvider and their React state cannot outlive a page load. Asserting the
  // navigation is asserting the guarantee (plan D-S1).
  it('navigates rather than merely clearing tokens, so no client state survives', () => {
    const result = signedIn();
    act(() => result.current.logout());
    expect(replace).toHaveBeenCalled();
  });

  it('uses replace so Back cannot return to the previous session', () => {
    const result = signedIn();
    act(() => result.current.logout());
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  // FR-D-015: no confirmation — one call signs out.
  it('signs out in a single call with no confirmation step', () => {
    const result = signedIn();
    act(() => result.current.logout());
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
