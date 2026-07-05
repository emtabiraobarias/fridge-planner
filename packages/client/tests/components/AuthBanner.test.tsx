import { act, render, screen, waitFor, type RenderResult } from '@testing-library/react';
import { AuthBanner } from '../../src/components/shared/AuthBanner';
import { AuthProvider } from '../../src/context/AuthContext';
import { ensureOk, AuthRequiredError } from '../../src/services/http';

function res(status: number): Response {
  return { status, ok: status >= 200 && status < 300 } as unknown as Response;
}

function renderBanner(): RenderResult {
  return render(
    <AuthProvider>
      <AuthBanner />
    </AuthProvider>,
  );
}

describe('AuthBanner (FR-D-009 / E0)', () => {
  it('renders nothing until a 401 occurs', () => {
    renderBanner();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces a re-authentication prompt when the API returns 401', () => {
    renderBanner();
    act(() => {
      expect(() => ensureOk(res(401), 'fetch inventory')).toThrow(AuthRequiredError);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/sign in/i);
  });

  it('exposes a Sign in button that starts the OIDC login (E0b)', async () => {
    process.env['NEXT_PUBLIC_OIDC_ISSUER'] = 'https://auth.example.com:8443/realms/fridge-planner';
    process.env['NEXT_PUBLIC_OIDC_CLIENT_ID'] = 'fridge-planner-app';
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { origin: 'http://localhost:3000', assign }, writable: true });
    renderBanner();
    act(() => {
      expect(() => ensureOk(res(401), 'fetch inventory')).toThrow(AuthRequiredError);
    });
    act(() => {
      screen.getByRole('button', { name: /sign in/i }).click();
    });
    // login() computes the PKCE challenge asynchronously before redirecting.
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://auth.example.com:8443/realms/fridge-planner/protocol/openid-connect/auth',
        ),
      ),
    );
    delete process.env['NEXT_PUBLIC_OIDC_ISSUER'];
    delete process.env['NEXT_PUBLIC_OIDC_CLIENT_ID'];
  });

  it('ignores non-401 errors (generic Error, no prompt)', () => {
    renderBanner();
    act(() => {
      expect(() => ensureOk(res(500), 'fetch inventory')).toThrow(/Failed to fetch inventory: 500/);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
