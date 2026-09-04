import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountPage } from '../../src/views/AccountPage';
import { AuthProvider } from '../../src/context/AuthContext';

/**
 * FR-AC-029: registration and password reset are reachable by a SIGNED-OUT visitor,
 * without first provoking a failed request.
 *
 * Mirrors `002` FR-D-013, and it is the kind of requirement that silently does not happen:
 * every other route in this app assumes a session, so a signed-out entry point is easy to
 * build behind one by accident. The whole point of a self-registration feature is that the
 * person using it does not have an account yet.
 */

function renderSignedOut(): void {
  // No token in sessionStorage and `/api/v1/me` refusing — i.e. a visitor with no account.
  window.sessionStorage.clear();
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response(null, { status: 401 }),
  );
  render(
    <AuthProvider>
      <AccountPage />
    </AuthProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AccountPage — signed-out reachability (FR-AC-029)', () => {
  it('shows the registration form to a visitor with no session', async () => {
    renderSignedOut();
    expect(await screen.findByTestId('register-form')).toBeInTheDocument();
  });

  it('asks for the three things registration needs, and nothing more', async () => {
    renderSignedOut();
    await screen.findByTestId('register-form');
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it('offers password reset without requiring a session either', async () => {
    renderSignedOut();
    expect(await screen.findByTestId('password-reset-link')).toBeInTheDocument();
  });

  it('offers sign-in too, so an existing user is not stuck on a registration page', async () => {
    renderSignedOut();
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('does not render the form behind a failed request', async () => {
    // The trap this requirement exists to prevent: reaching registration only AFTER an
    // authenticated call has 401'd. Nothing here has provoked a failure, and the form is
    // already there.
    renderSignedOut();
    await screen.findByTestId('register-form');
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const attemptedRegister = calls.some((c) => String(c[0]).includes('/accounts/register'));
    expect(attemptedRegister).toBe(false);
  });
});

describe('AccountPage — registering', () => {
  it('submits the three fields to the register endpoint', async () => {
    window.sessionStorage.clear();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url).includes('/accounts/register')) {
        return new Response(JSON.stringify({ accountId: 'acc-1' }), { status: 201 });
      }
      return new Response(null, { status: 401 });
    });
    render(
      <AuthProvider>
        <AccountPage />
      </AuthProvider>,
    );
    await screen.findByTestId('register-form');

    await userEvent.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
    await userEvent.type(screen.getByLabelText(/name/i), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      const body = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/accounts/register'),
      )?.[1]?.body;
      expect(JSON.parse(String(body))).toEqual({
        email: 'ada@example.com',
        password: 'correct-horse-battery',
        displayName: 'Ada',
      });
    });
  });

  it('tells the person to go and verify, rather than pretending they are signed in', async () => {
    // Registration does NOT produce a session (FR-AC-014). Showing a success state that
    // looks like sign-in would leave someone clicking around a signed-out app wondering
    // why nothing works.
    window.sessionStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('/accounts/register')
        ? new Response(JSON.stringify({ accountId: 'acc-1' }), { status: 201 })
        : new Response(null, { status: 401 }),
    );
    render(
      <AuthProvider>
        <AccountPage />
      </AuthProvider>,
    );
    await screen.findByTestId('register-form');
    await userEvent.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct-horse-battery');
    await userEvent.type(screen.getByLabelText(/name/i), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByTestId('register-verify-notice')).toHaveTextContent(/verif/i);
  });

  it('shows the provider’s stated reason when a password is rejected (FR-AC-017)', async () => {
    // The reason the server passes it through at all: without it, someone retypes a
    // password with no idea what is wrong with it.
    window.sessionStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('/accounts/register')
        ? new Response(
            JSON.stringify({ title: 'Registration Rejected', detail: 'Invalid password: minimum length 12.' }),
            { status: 400 },
          )
        : new Response(null, { status: 401 }),
    );
    render(
      <AuthProvider>
        <AccountPage />
      </AuthProvider>,
    );
    await screen.findByTestId('register-form');
    await userEvent.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'short');
    await userEvent.type(screen.getByLabelText(/name/i), 'Ada');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByTestId('register-error')).toHaveTextContent(/minimum length 12/);
  });
});
