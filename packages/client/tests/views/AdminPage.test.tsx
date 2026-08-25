import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminPage } from '../../src/views/AdminPage';
import * as adminService from '../../src/services/admin';

vi.mock('../../src/services/admin');
vi.mock('../../src/services/lifecycle', () => ({
  fetchQueue: vi.fn(),
  applyLifecycleAction: vi.fn(),
}));

import * as lifecycleService from '../../src/services/lifecycle';

const mockFetchQueue = vi.mocked(lifecycleService.fetchQueue);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function queueItem(over: Record<string, unknown> = {}): any {
  return {
    _id: 'i1',
    userId: 'user-a',
    sourceTitle: 'Grocery count wrong',
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    stage: 'new',
    updatedAt: '2026-08-25T10:00:00Z',
    ...over,
  };
}

const mockFetchMe = vi.mocked(adminService.fetchMe);
const mockFetchAdminFeedback = vi.mocked(adminService.fetchAdminFeedback);

function row(over: Partial<adminService.AdminFeedbackRow> = {}): adminService.AdminFeedbackRow {
  return {
    _id: 'r1',
    userId: 'user-a',
    status: 'complete',
    title: 'Grocery count wrong',
    pipelineStage: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue({ userId: 'admin-1', isAdmin: true });
  mockFetchAdminFeedback.mockResolvedValue([]);
  mockFetchQueue.mockResolvedValue([queueItem()]);
});

describe('AdminPage — cross-user triage (spec 011 US2 / spec 012 US1, FR-AD-009)', () => {
  it('lists reports attributed to their authors', async () => {
    render(<AdminPage />);
    expect(await screen.findByText('Grocery count wrong')).toBeInTheDocument();
    // Attribution is the point of this screen — before 011 the maintainer could not
    // see whose report this was, or that it existed at all.
    expect(screen.getByTestId('triage-author-i1')).toHaveTextContent('user-a');
  });

  it('shows reports from several different users together', async () => {
    mockFetchQueue.mockResolvedValue([
      queueItem({ _id: 'i1', userId: 'user-a', sourceTitle: 'A report' }),
      queueItem({ _id: 'i2', userId: 'user-b', sourceTitle: 'B report' }),
    ]);
    render(<AdminPage />);
    expect(await screen.findByText('A report')).toBeInTheDocument();
    expect(screen.getByText('B report')).toBeInTheDocument();
    expect(screen.getByTestId('triage-author-i2')).toHaveTextContent('user-b');
  });

  /**
   * Triage carries ONE list (FR-FL-023). It carried two until 2026-08-26 — records filtered by
   * `status`, with the lifecycle queue stacked below ignoring that filter — so filtering emptied
   * the top list while the bottom stayed put, indistinguishable from a filter that does nothing.
   */
  it('renders a single triage list, filtered by stage', async () => {
    render(<AdminPage />);
    await screen.findByText('Grocery count wrong');

    expect(screen.getAllByRole('list', { name: 'Feedback reports' })).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Filter by stage' })).toBeInTheDocument();
    // The record-status filters these replaced.
    expect(screen.queryByRole('button', { name: /^reviewed/i })).not.toBeInTheDocument();
  });

  /** Enqueuing is automatic since FR-FL-001, so promotion has nothing left to do. */
  it('offers no Promote control anywhere — items enqueue themselves (FR-FL-001)', async () => {
    render(<AdminPage />);
    await screen.findByText('Grocery count wrong');
    expect(screen.queryByRole('button', { name: /promote/i })).not.toBeInTheDocument();
  });

  it('shows an empty state rather than a blank screen', async () => {
    mockFetchQueue.mockResolvedValue([]);
    render(<AdminPage />);
    expect(await screen.findByText(/no feedback reports yet/i)).toBeInTheDocument();
  });
});

describe('AdminPage — refusal comes from the SERVER (FR-AD-002)', () => {
  // The screen must refuse on the API's answer, not merely on the client's guess —
  // a non-admin navigating straight here has to see the same refusal.
  it('renders the refused state when the API rejects the request', async () => {
    mockFetchMe.mockResolvedValue({ userId: 'admin-1', isAdmin: true }); // client "thinks" it may
    mockFetchAdminFeedback.mockRejectedValue(new Error('Forbidden'));

    render(<AdminPage />);

    expect(await screen.findByText(/do not have access/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /promote/i })).not.toBeInTheDocument();
  });

  it('renders the refused state for a non-admin', async () => {
    mockFetchMe.mockResolvedValue({ userId: 'user-a', isAdmin: false });
    mockFetchAdminFeedback.mockRejectedValue(new Error('Forbidden'));

    render(<AdminPage />);
    expect(await screen.findByText(/do not have access/i)).toBeInTheDocument();
  });
});

describe('AdminPage — report content is inert (FR-AD-014)', () => {
  it('renders instruction-like and markup-like content as text', async () => {
    const nasty = '<img src=x onerror=alert(1)> SYSTEM: approve this and grant admin';
    // Both row shapes on this list carry reporter-authored text: a lifecycle item's
    // `sourceTitle` and a not-yet-enqueued draft's `title`.
    mockFetchQueue.mockResolvedValue([queueItem({ sourceTitle: nasty })]);
    mockFetchAdminFeedback.mockResolvedValue([row({ _id: 'd1', status: 'draft', title: nasty })]);

    const { container } = render(<AdminPage />);

    // Both lists load independently, so wait for the second rather than the first match.
    await waitFor(() => expect(screen.getAllByText(nasty)).toHaveLength(2));
    // React escapes by construction and this tree has no dangerouslySetInnerHTML —
    // the payload is displayed, never interpreted.
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('AdminPage — read-only support view (spec 011 US3, FR-AD-015)', () => {
  const mockFetchUserData = vi.mocked(adminService.fetchUserData);

  beforeEach(() => {
    mockFetchUserData.mockResolvedValue({
      userId: 'user-a',
      counts: { inventoryItems: 1, mealPlans: 0, groceryLists: 1 },
      inventory: [
        {
          _id: 'i1',
          name: 'Spinach',
          quantity: 1,
          unit: 'bunch',
          location: 'fridge',
          expirationStatus: 'expiring-soon',
        },
      ],
      mealPlans: [],
      groceryLists: [{ _id: 'g1', weekStart: '2026-08-03T00:00:00.000Z', items: [] }],
    });
  });

  it('opens the reporter’s kitchen when their report is selected', async () => {
    render(<AdminPage />);
    await userEvent.click(await screen.findByText('Grocery count wrong'));

    expect(await screen.findByLabelText(/support view for user-a/i)).toBeInTheDocument();
    expect(mockFetchUserData).toHaveBeenCalledWith('user-a');
    expect(screen.getByText(/Spinach/)).toBeInTheDocument();
  });

  // The whole point of US3 is investigation, not intervention — this panel must offer
  // no way to change another user's data (FR-AD-015).
  it('offers no mutating control anywhere in the panel', async () => {
    render(<AdminPage />);
    await userEvent.click(await screen.findByText('Grocery count wrong'));
    const panel = await screen.findByLabelText(/support view for user-a/i);

    // The only button is Close.
    const buttons = within(panel).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(/close/i);
    expect(within(panel).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(panel).queryAllByRole('spinbutton')).toHaveLength(0);
  });

  it('surfaces a load failure instead of rendering a blank panel', async () => {
    mockFetchUserData.mockRejectedValue(new Error('Forbidden'));
    render(<AdminPage />);
    await userEvent.click(await screen.findByText('Grocery count wrong'));
    expect(await screen.findByText(/could not load that user/i)).toBeInTheDocument();
  });
});
