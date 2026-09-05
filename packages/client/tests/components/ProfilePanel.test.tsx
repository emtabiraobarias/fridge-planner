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

  it('does not delete on the first click (FR-AC-025)', async () => {
    // Two-step, like `003` FR-F-020's record deletion. This is the largest thing a person can
    // destroy in the app and it is permanent after the recovery window, so a single misplaced
    // tap must not start it.
    const fetchMock = mockApi(PROFILE);
    render(<ProfilePanel />);
    await userEvent.click(await screen.findByTestId('delete-button'));

    expect(screen.getByTestId('delete-confirm')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);
  });

  it('deletes once confirmed, and says the account is SCHEDULED rather than gone', async () => {
    // The distinction is the recovery window: telling someone their data is gone when it is
    // restorable for 30 days would stop them asking for it back.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (init?.method === 'DELETE') {
        return new Response(JSON.stringify({ recoverableForDays: 30, purgeAfter: 'x' }), {
          status: 202,
        });
      }
      return new Response(JSON.stringify(PROFILE), { status: 200 });
    });
    render(<ProfilePanel />);
    await userEvent.click(await screen.findByTestId('delete-button'));
    await userEvent.click(screen.getByTestId('delete-confirm-button'));

    const notice = await screen.findByTestId('account-deleted-notice');
    expect(notice).toHaveTextContent(/scheduled for deletion/i);
    expect(notice).toHaveTextContent(/30 days/);
  });

  it('shows the administrator refusal as written (FR-AC-026)', async () => {
    // Its message explains what to do instead — ask another administrator — so replacing it
    // with a generic failure would strip the only useful part.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (init?.method === 'DELETE') {
        return new Response(
          JSON.stringify({
            title: 'Cannot Delete Administrator',
            detail: 'An administrator cannot delete their own account — ask another administrator.',
          }),
          { status: 409 },
        );
      }
      return new Response(JSON.stringify(PROFILE), { status: 200 });
    });
    render(<ProfilePanel />);
    await userEvent.click(await screen.findByTestId('delete-button'));
    await userEvent.click(screen.getByTestId('delete-confirm-button'));

    expect(await screen.findByTestId('profile-error')).toHaveTextContent(/another administrator/i);
  });

  it('offers the export as a download rather than rendering it', async () => {
    // An export is for taking elsewhere. Rendering it would put every field on screen and
    // still leave the person with no file.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('/export')
        ? new Response(JSON.stringify({ data: {} }), { status: 200 })
        : new Response(JSON.stringify(PROFILE), { status: 200 }),
    );
    const createUrl = vi.fn(() => 'blob:fake');
    vi.stubGlobal('URL', { ...URL, createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    render(<ProfilePanel />);
    await userEvent.click(await screen.findByTestId('export-button'));
    await waitFor(() => expect(createUrl).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });
});
