import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeliveryPanel } from '../../../src/components/admin/DeliveryPanel';

vi.mock('../../../src/services/lifecycle', () => ({
  fetchQueue: vi.fn(),
  applyLifecycleAction: vi.fn(),
  fetchClauses: vi.fn().mockResolvedValue([]),
  draftClauses: vi.fn().mockResolvedValue([]),
  vetClause: vi.fn().mockResolvedValue([]),
  fetchReleaseList: vi.fn().mockResolvedValue({ releases: [], available: false }),
}));

import { fetchQueue, applyLifecycleAction } from '../../../src/services/lifecycle';

const mockQueue = vi.mocked(fetchQueue);
const mockAct = vi.mocked(applyLifecycleAction);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function item(over: Record<string, unknown> = {}): any {
  return {
    _id: 'i1',
    userId: 'reporter-1',
    sourceTitle: 'Grocery rows duplicate',
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    stage: 'in-spec',
    updatedAt: '2026-08-25T10:00:00Z',
    ...over,
  };
}

/** Controls live in the item's modal, not on its row — open it first. */
async function openItem(title = 'Grocery rows duplicate'): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(title, 'i') }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQueue.mockResolvedValue([item()]);
  mockAct.mockResolvedValue(item({ stage: 'in-progress' }));
});

describe('DeliveryPanel — only the legal controls for a stage', () => {
  it('offers gate 2 in `in-spec`, and its rejection route (FR-FL-009/014)', async () => {
    render(<DeliveryPanel />);
    await openItem();
    expect(screen.getByRole('button', { name: /approve spec/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject spec/i })).toBeInTheDocument();
    // Gate 3 does not govern this stage (FR-FL-015).
    expect(screen.queryByRole('button', { name: /approve release/i })).not.toBeInTheDocument();
  });

  it('offers gate 3 and a changes-needed route in `in-review` (FR-FL-010/064)', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'in-review' })]);
    render(<DeliveryPanel />);
    await openItem();
    expect(screen.getByRole('button', { name: /approve release/i })).toBeInTheDocument();
    // Without this, review finding a problem has nowhere to send the work.
    expect(screen.getByRole('button', { name: /changes needed/i })).toBeInTheDocument();
  });

  it('never auto-closes a shipped item — closing is explicit (D9)', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'shipped' })]);
    render(<DeliveryPanel />);
    await openItem();
    expect(screen.getByRole('button', { name: /^close$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^park$/i })).not.toBeInTheDocument();
  });

  it('leaves triage-stage items to the Triage tab', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'new' }), item({ _id: 'i2', stage: 'in-spec' })]);
    render(<DeliveryPanel />);
    expect(await screen.findAllByTestId(/^delivery-stage-/)).toHaveLength(1);
  });

  it('surfaces a refused action instead of appearing to do nothing', async () => {
    mockAct.mockRejectedValue(new Error('409'));
    render(<DeliveryPanel />);
    await openItem();
    await userEvent.click(screen.getByRole('button', { name: /approve spec/i }));
    // Shown in the item that was acted on, not above the list where the load failure lives.
    expect(await screen.findByRole('alert')).toHaveTextContent(/refused/i);
  });

  it('never presents a failed load as an empty delivery queue', async () => {
    mockQueue.mockRejectedValue(new Error('offline'));
    render(<DeliveryPanel />);
    // The FR-F-021 lesson: a maintainer with work in flight must not be told there is none.
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
    expect(screen.queryByText(/nothing in delivery/i)).not.toBeInTheDocument();
  });
});

/** The same stage filter Triage carries — one maintainer surface, one filter (D7/FR-FL-056). */
describe('DeliveryPanel — filtering by stage (FR-AD-009)', () => {
  it('narrows the list to one stage', async () => {
    mockQueue.mockResolvedValue([
      item({ _id: 'i1', sourceTitle: 'Being specced' }),
      item({ _id: 'i2', sourceTitle: 'Awaiting release', stage: 'in-review' }),
    ]);
    render(<DeliveryPanel />);
    await screen.findByText('Being specced');

    await userEvent.click(screen.getByRole('button', { name: /^in review \(1\)$/i }));

    expect(screen.getByText('Awaiting release')).toBeInTheDocument();
    expect(screen.queryByText('Being specced')).not.toBeInTheDocument();
  });

  it('counts only what Delivery actually shows, not the whole queue', async () => {
    mockQueue.mockResolvedValue([
      item({ _id: 'i1' }),
      item({ _id: 'i2', stage: 'new' }), // triage — belongs to the other tab
      item({ _id: 'i3', stage: 'dismissed' }), // terminal — never in delivery
    ]);
    render(<DeliveryPanel />);
    expect(await screen.findByRole('button', { name: /^all \(1\)$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^new/i })).not.toBeInTheDocument();
  });

  it('says the stage is empty rather than that delivery is', async () => {
    mockQueue.mockResolvedValue([
      item({ sourceTitle: 'Being specced' }),
      item({ _id: 'i2', sourceTitle: 'Awaiting release', stage: 'in-review' }),
    ]);
    render(<DeliveryPanel />);
    await screen.findByText('Being specced');

    await userEvent.click(screen.getByRole('button', { name: /^in review \(1\)$/i }));
    await waitFor(() => expect(screen.queryByText('Being specced')).not.toBeInTheDocument());
    expect(screen.queryByText(/nothing in delivery/i)).not.toBeInTheDocument();
  });

  it('opens an item as a dialog, dismissable by Escape', async () => {
    render(<DeliveryPanel />);
    await openItem();
    const dialog = screen.getByRole('dialog');
    // The shared Overlay: bottom sheet on touch, centred dialog on desktop, focus trapped.
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts clause vetting inside the item at `briefed` (FR-FL-025)', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'briefed' })]);
    render(<DeliveryPanel />);
    await openItem();
    // On a phone this used to expand inside a list cell, where the clause comparison —
    // the entire point of the step — was unreadable at 320px.
    expect(within(screen.getByRole('dialog')).getByLabelText('Clause vetting')).toBeInTheDocument();
  });
});

/** FR-FL-067 — a disabled button that says why beats a live one the server refuses. */
describe('DeliveryPanel — advancing out of in-progress needs a pull request', () => {
  const PR = { type: 'pull-request', ref: 'https://example.invalid/pull/42', at: '2026-08-26T00:00:00Z' };

  it('withholds Ready for review until a pull request is attached', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'in-progress' })]);
    render(<DeliveryPanel />);
    await openItem();
    // The server refuses this anyway; disabling says why BEFORE the click rather than after.
    expect(screen.getByRole('button', { name: /ready for review/i })).toBeDisabled();
  });

  it('enables it once one is attached', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'in-progress', artifacts: [PR] })]);
    render(<DeliveryPanel />);
    await openItem();
    expect(screen.getByRole('button', { name: /ready for review/i })).toBeEnabled();
  });

  it('offers a control to attach one — it was curl-only before', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'in-progress' })]);
    render(<DeliveryPanel />);
    await openItem();

    await userEvent.type(screen.getByLabelText(/attach pull request/i), 'https://example.invalid/pull/7');
    await userEvent.click(screen.getByRole('button', { name: /attach pull request/i }));

    await waitFor(() =>
      expect(mockAct).toHaveBeenCalledWith('i1', {
        action: 'attach-artifact',
        artifact: { type: 'pull-request', ref: 'https://example.invalid/pull/7' },
      }),
    );
  });

  it('shows an attached reference as text, never as a link (FR-FL-057)', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'in-progress', artifacts: [PR] })]);
    render(<DeliveryPanel />);
    await openItem();
    const refs = within(screen.getByLabelText('Attached references'));
    expect(refs.getByText(PR.ref)).toBeInTheDocument();
    // The app must not invite a click on something it has never dereferenced.
    expect(refs.queryByRole('link')).not.toBeInTheDocument();
  });
});

