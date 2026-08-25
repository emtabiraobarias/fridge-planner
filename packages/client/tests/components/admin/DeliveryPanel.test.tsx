import { render, screen, waitFor } from '@testing-library/react';
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

beforeEach(() => {
  vi.clearAllMocks();
  mockQueue.mockResolvedValue([item()]);
  mockAct.mockResolvedValue(item({ stage: 'in-progress' }));
});

describe('DeliveryPanel — only the legal controls for a stage', () => {
  it('offers gate 2 in `in-spec`, and its rejection route (FR-FL-009/014)', async () => {
    render(<DeliveryPanel />);
    expect(await screen.findByRole('button', { name: /approve spec/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject spec/i })).toBeInTheDocument();
    // Gate 3 does not govern this stage (FR-FL-015).
    expect(screen.queryByRole('button', { name: /approve release/i })).not.toBeInTheDocument();
  });

  it('offers gate 3 and a changes-needed route in `in-review` (FR-FL-010/064)', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'in-review' })]);
    render(<DeliveryPanel />);
    expect(await screen.findByRole('button', { name: /approve release/i })).toBeInTheDocument();
    // Without this, review finding a problem has nowhere to send the work.
    expect(screen.getByRole('button', { name: /changes needed/i })).toBeInTheDocument();
  });

  it('never auto-closes a shipped item — closing is explicit (D9)', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'shipped' })]);
    render(<DeliveryPanel />);
    expect(await screen.findByRole('button', { name: /^close$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^park$/i })).not.toBeInTheDocument();
  });

  it('leaves triage-stage items to the Triage tab', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'new' }), item({ _id: 'i2', stage: 'in-spec' })]);
    render(<DeliveryPanel />);
    await screen.findByRole('button', { name: /approve spec/i });
    expect(screen.getAllByTestId(/^delivery-stage-/)).toHaveLength(1);
  });

  it('surfaces a refused action instead of appearing to do nothing', async () => {
    mockAct.mockRejectedValue(new Error('409'));
    render(<DeliveryPanel />);
    await userEvent.click(await screen.findByRole('button', { name: /approve spec/i }));
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
});
