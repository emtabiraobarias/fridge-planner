// T107/T110/T111 — the account surface (spec 002 US4: FR-D-012/013/015/017).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountPanel } from '../../../src/components/account/AccountPanel';
import * as adminService from '../../../src/services/admin';
import * as authCtx from '../../../src/context/AuthContext';

vi.mock('../../../src/services/admin');
const mockFetchMe = vi.mocked(adminService.fetchMe);

const login = vi.fn();
const logout = vi.fn();

function mockAuth(isAuthenticated: boolean): void {
  vi.spyOn(authCtx, 'useAuth').mockReturnValue({
    accessToken: isAuthenticated ? 'tok' : null,
    isAuthenticated,
    login,
    logout,
    setToken: vi.fn(),
    completeLogin: vi.fn(),
  } as unknown as ReturnType<typeof authCtx.useAuth>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue({ userId: 'alice', isAdmin: false });
  mockAuth(true);
});

describe('AccountPanel — identity (FR-D-012)', () => {
  it('shows which account is signed in', async () => {
    render(<AccountPanel />);
    expect(await screen.findByTestId('account-identity')).toHaveTextContent('alice');
  });

  it('marks an administrator with a badge', async () => {
    mockFetchMe.mockResolvedValue({ userId: 'demo-admin', isAdmin: true });
    render(<AccountPanel />);
    expect(await screen.findByTestId('account-admin-badge')).toHaveTextContent(/admin/i);
  });

  it('shows NO admin badge for an ordinary user', async () => {
    render(<AccountPanel />);
    await screen.findByTestId('account-identity');
    expect(screen.queryByTestId('account-admin-badge')).not.toBeInTheDocument();
  });

  // Rendering nothing while unknown is the point: an ordinary user must never see an
  // Admin badge flash before the real answer arrives.
  it('renders nothing until the identity is known', () => {
    mockFetchMe.mockReturnValue(new Promise(() => undefined)); // never resolves
    const { container } = render(<AccountPanel />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AccountPanel — sign out (FR-D-011/015)', () => {
  it('signs out in ONE action, with no confirmation step', async () => {
    render(<AccountPanel />);
    await screen.findByTestId('account-identity');

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    // No dialog appeared, and the single click was enough.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});

describe('AccountPanel — proactive sign in (FR-D-013)', () => {
  // The whole point: a signed-out user must be able to sign in WITHOUT first
  // provoking a 401. AuthBanner's post-401 prompt is unchanged, just no longer the
  // only route in.
  it('offers sign-in to a signed-out user without a prior failed request', async () => {
    mockAuth(false);
    // Signed out means the SERVER has no identity for us either — /me rejects.
    mockFetchMe.mockRejectedValue(new Error('401'));
    render(<AccountPanel />);

    const button = screen.getByRole('button', { name: /sign in/i });
    await userEvent.click(button);

    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });

  // Signed-in state follows the SERVER's answer, not the client token: under the dev
  // auth seam the browser holds no token yet /me still identifies the caller. Keying
  // off the token alone showed a permanent "Sign in" to an identified user.
  it('shows the identity when /me knows us even though no client token is held', async () => {
    mockAuth(false);
    mockFetchMe.mockResolvedValue({ userId: 'seam-user', isAdmin: false });
    render(<AccountPanel />);
    expect(await screen.findByTestId('account-identity')).toHaveTextContent('seam-user');
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
  });
});
