import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfilePanel } from '../../src/components/account/ProfilePanel';

/** Answer the profile read, and record what else the panel calls. */
function mockApi(profile: Record<string, unknown> | null): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const href = String(url);
    if (href.includes('/accounts/me') && (init?.method ?? 'GET') === 'GET') {
      return profile
        ? new Response(JSON.stringify(profile), { status: 200 })
        : new Response(null, { status: 404 });
    }
    return new Response(null, { status: 200 });
  });
}

const PROFILE = {
  accountId: 'acc-1',
  email: 'ada@example.com',
  displayName: 'Ada',
  isAdmin: false,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProfilePanel (spec 013 US2)', () => {
  it('renders nothing when there is no account record', async () => {
    // A blank profile that looks real is worse than no panel: it invites someone to "fix"
    // fields that were never loaded.
    mockApi(null);
    const { container } = render(<ProfilePanel />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows the current display name and email', async () => {
    mockApi(PROFILE);
    render(<ProfilePanel />);
    expect(await screen.findByDisplayValue('Ada')).toBeInTheDocument();
    expect(screen.getByTestId('profile-email')).toHaveTextContent('ada@example.com');
  });

  it('saves a new display name (FR-AC-021)', async () => {
    const fetchMock = mockApi(PROFILE);
    render(<ProfilePanel />);
    const field = await screen.findByLabelText(/display name/i);
    await userEvent.clear(field);
    await userEvent.type(field, 'Ada Lovelace');
    await userEvent.click(screen.getByRole('button', { name: /save display name/i }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH');
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ displayName: 'Ada Lovelace' });
    });
  });

  it('offers NO way to change the email address (FR-AC-034/035)', async () => {
    // The stored address is what FR-AC-008 matches on when a new provider appears. A
    // self-service edit would let someone re-point their identity at an address they have not
    // proved they own — so the absence of this control is the requirement, not an omission.
    mockApi(PROFILE);
    render(<ProfilePanel />);
    await screen.findByTestId('profile-email');
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
  });

  it('starts a password reset without ever taking a password (FR-AC-033)', async () => {
    const fetchMock = mockApi(PROFILE);
    render(<ProfilePanel />);
    await userEvent.click(await screen.findByTestId('profile-reset-button'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/password-reset'));
      expect(call).toBeDefined();
      // Only the address goes up. There is no password field on this panel at all, and the
      // provider hosts the form that eventually takes one.
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ email: 'ada@example.com' });
    });
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('says the same thing after a reset regardless of what the server found (FR-AC-023)', async () => {
    mockApi(PROFILE);
    render(<ProfilePanel />);
    await userEvent.click(await screen.findByTestId('profile-reset-button'));
    expect(await screen.findByTestId('profile-reset-sent')).toHaveTextContent(/if that address/i);
  });

  it('reports a failed save rather than showing "Saved"', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const href = String(url);
      if (href.includes('/accounts/me') && (init?.method ?? 'GET') === 'GET') {
        return new Response(JSON.stringify(PROFILE), { status: 200 });
      }
      return new Response(null, { status: 500 });
    });
    render(<ProfilePanel />);
    const field = await screen.findByLabelText(/display name/i);
    await userEvent.clear(field);
    await userEvent.type(field, 'Nope');
    await userEvent.click(screen.getByRole('button', { name: /save display name/i }));
    expect(await screen.findByTestId('profile-error')).toBeInTheDocument();
  });
});
