import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriageQueue } from '../../../src/components/admin/TriageQueue';

vi.mock('../../../src/services/lifecycle', () => ({
  fetchQueue: vi.fn(),
  applyLifecycleAction: vi.fn(),
}));

import { fetchQueue, applyLifecycleAction } from '../../../src/services/lifecycle';

const mockQueue = vi.mocked(fetchQueue);
const mockAct = vi.mocked(applyLifecycleAction);

function item(over: Record<string, unknown> = {}): never {
  return {
    _id: 'i1',
    userId: 'reporter-1',
    sourceTitle: 'Grocery rows duplicate',
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    stage: 'new',
    updatedAt: '2026-08-25T10:00:00Z',
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQueue.mockResolvedValue([item()]);
  mockAct.mockResolvedValue(item({ stage: 'accepted' }));
});

describe('TriageQueue', () => {
  it('lists what is waiting, across reporters (FR-FL-023)', async () => {
    mockQueue.mockResolvedValue([item(), item({ _id: 'i2', userId: 'reporter-2' })]);
    render(<TriageQueue />);
    await waitFor(() => expect(screen.getAllByText('Grocery rows duplicate')).toHaveLength(2));
  });

  it('accepts a report at gate 1 (FR-FL-008)', async () => {
    render(<TriageQueue />);
    await userEvent.click(await screen.findByRole('button', { name: /accept/i }));
    await waitFor(() => expect(mockAct).toHaveBeenCalledWith('i1', { action: 'accept' }));
  });

  // FR-FL-016: the reason is part of the decision, so it must be chosen — never defaulted.
  it('requires a reason to be picked before dismissing (FR-FL-016)', async () => {
    render(<TriageQueue />);
    await userEvent.click(await screen.findByRole('button', { name: /^dismiss$/i }));
    // Clicking Dismiss alone must not have acted yet.
    expect(mockAct).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /declined/i }));
    await waitFor(() =>
      expect(mockAct).toHaveBeenCalledWith('i1', { action: 'dismiss', reason: 'declined' }),
    );
  });

  it('offers both dismissal reasons, kept distinguishable (FR-FL-017)', async () => {
    render(<TriageQueue />);
    await userEvent.click(await screen.findByRole('button', { name: /^dismiss$/i }));
    expect(screen.getByRole('button', { name: /no action required/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /declined/i })).toBeInTheDocument();
  });

  it('never presents a failed load as an empty queue', async () => {
    mockQueue.mockRejectedValue(new Error('offline'));
    render(<TriageQueue />);
    // The FR-F-021 lesson: a user with a full queue must not be told it is empty.
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
    expect(screen.queryByText(/nothing waiting/i)).not.toBeInTheDocument();
  });

  it('surfaces a refused action instead of appearing to do nothing', async () => {
    mockAct.mockRejectedValue(new Error('409'));
    render(<TriageQueue />);
    await userEvent.click(await screen.findByRole('button', { name: /accept/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/refused/i);
  });

  it('shows no accept/dismiss controls once an item has left `new`', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'in-progress' })]);
    render(<TriageQueue />);
    await screen.findByText('Grocery rows duplicate');
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^dismiss$/i })).not.toBeInTheDocument();
  });

  it('marks an item whose reporter was erased (FR-FL-060)', async () => {
    mockQueue.mockResolvedValue([item({ reporterErasedAt: '2026-08-25T00:00:00Z' })]);
    render(<TriageQueue />);
    expect(await screen.findByText(/reporter erased/i)).toBeInTheDocument();
  });
});
