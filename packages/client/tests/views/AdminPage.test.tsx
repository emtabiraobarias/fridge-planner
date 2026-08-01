import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminPage } from '../../src/views/AdminPage';
import * as adminService from '../../src/services/admin';

vi.mock('../../src/services/admin');

const mockFetchMe = vi.mocked(adminService.fetchMe);
const mockFetchAdminFeedback = vi.mocked(adminService.fetchAdminFeedback);
const mockPromote = vi.mocked(adminService.promoteFeedback);

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
  mockFetchAdminFeedback.mockResolvedValue([row()]);
  mockPromote.mockResolvedValue();
});

describe('AdminPage — cross-user triage (spec 011 US2, FR-AD-009)', () => {
  it('lists reports attributed to their authors', async () => {
    render(<AdminPage />);
    expect(await screen.findByText('Grocery count wrong')).toBeInTheDocument();
    // Attribution is the point of this screen — before 011 the maintainer could not
    // see whose report this was, or that it existed at all.
    expect(screen.getByTestId('triage-author-r1')).toHaveTextContent('user-a');
  });

  it('shows reports from several different users together', async () => {
    mockFetchAdminFeedback.mockResolvedValue([
      row({ _id: 'r1', userId: 'user-a', title: 'A report' }),
      row({ _id: 'r2', userId: 'user-b', title: 'B report' }),
    ]);
    render(<AdminPage />);
    expect(await screen.findByText('A report')).toBeInTheDocument();
    expect(screen.getByText('B report')).toBeInTheDocument();
    expect(screen.getByTestId('triage-author-r2')).toHaveTextContent('user-b');
  });

  it('promotes a completed report and reloads the list', async () => {
    render(<AdminPage />);
    await screen.findByText('Grocery count wrong');

    await userEvent.click(screen.getByRole('button', { name: /promote/i }));

    await waitFor(() => expect(mockPromote).toHaveBeenCalledWith('r1'));
    expect(mockFetchAdminFeedback).toHaveBeenCalledTimes(2); // initial + reload
  });

  it('offers no Promote control for a draft or an already-promoted report', async () => {
    mockFetchAdminFeedback.mockResolvedValue([
      row({ _id: 'r1', status: 'draft', title: 'Draft one' }),
      row({ _id: 'r2', pipelineStage: 'approved', title: 'Already in' }),
    ]);
    render(<AdminPage />);
    await screen.findByText('Draft one');
    expect(screen.queryByRole('button', { name: /promote/i })).not.toBeInTheDocument();
  });

  it('filters by status', async () => {
    render(<AdminPage />);
    await screen.findByText('Grocery count wrong');

    await userEvent.click(screen.getByRole('button', { name: 'Draft' }));

    await waitFor(() =>
      expect(mockFetchAdminFeedback).toHaveBeenLastCalledWith({ status: 'draft' }),
    );
  });

  it('shows an empty state rather than a blank screen', async () => {
    mockFetchAdminFeedback.mockResolvedValue([]);
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
    mockFetchAdminFeedback.mockResolvedValue([row({ title: nasty })]);

    const { container } = render(<AdminPage />);

    expect(await screen.findByText(nasty)).toBeInTheDocument();
    // React escapes by construction and this tree has no dangerouslySetInnerHTML —
    // the payload is displayed, never interpreted.
    expect(container.querySelector('img')).toBeNull();
  });
});
