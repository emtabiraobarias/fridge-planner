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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function item(over: Record<string, unknown> = {}): any {
  return {
    _id: 'i1',
    userId: 'reporter-1',
    sourceTitle: 'Grocery rows duplicate',
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    stage: 'new',
    updatedAt: '2026-08-25T10:00:00Z',
    ...over,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function draft(over: Record<string, unknown> = {}): any {
  return { _id: 'd1', userId: 'reporter-9', status: 'draft', pipelineStage: null, ...over };
}

const onSelectUser = vi.fn();

/** Controls live in the item's modal, not on its row — open it first. */
async function openItem(title = 'Grocery rows duplicate'): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(title, 'i') }));
}

/** The queue is fed its drafts by `AdminPage`, whose request is also the FR-AD-002 probe. */
function renderQueue(drafts: unknown[] = []): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(<TriageQueue drafts={drafts as any} onSelectUser={onSelectUser} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQueue.mockResolvedValue([item()]);
  mockAct.mockResolvedValue(item({ stage: 'accepted' }));
});

describe('TriageQueue', () => {
  it('lists what is waiting, across reporters (FR-FL-023)', async () => {
    mockQueue.mockResolvedValue([item(), item({ _id: 'i2', userId: 'reporter-2' })]);
    renderQueue();
    await waitFor(() => expect(screen.getAllByText('Grocery rows duplicate')).toHaveLength(2));
  });

  it('accepts a report at gate 1 (FR-FL-008)', async () => {
    renderQueue();
    await openItem();
    await userEvent.click(await screen.findByRole('button', { name: /^accept$/i }));
    await waitFor(() => expect(mockAct).toHaveBeenCalledWith('i1', { action: 'accept' }));
  });

  // FR-FL-016: the reason is part of the decision, so it must be chosen — never defaulted.
  it('requires a reason to be picked before dismissing (FR-FL-016)', async () => {
    renderQueue();
    await openItem();
    await userEvent.click(await screen.findByRole('button', { name: /^dismiss$/i }));
    // Clicking Dismiss alone must not have acted yet.
    expect(mockAct).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /declined/i }));
    await waitFor(() =>
      expect(mockAct).toHaveBeenCalledWith('i1', { action: 'dismiss', reason: 'declined' }),
    );
  });

  it('offers both dismissal reasons, kept distinguishable (FR-FL-017)', async () => {
    renderQueue();
    await openItem();
    await userEvent.click(await screen.findByRole('button', { name: /^dismiss$/i }));
    expect(screen.getByRole('button', { name: /no action required/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /declined/i })).toBeInTheDocument();
  });

  it('never presents a failed load as an empty queue', async () => {
    mockQueue.mockRejectedValue(new Error('offline'));
    renderQueue();
    // The FR-F-021 lesson: a user with a full queue must not be told it is empty.
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
    expect(screen.queryByText(/no feedback reports yet/i)).not.toBeInTheDocument();
  });

  it('surfaces a refused action instead of appearing to do nothing', async () => {
    mockAct.mockRejectedValue(new Error('409'));
    renderQueue();
    await openItem();
    await userEvent.click(await screen.findByRole('button', { name: /^accept$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/refused/i);
  });

  it('shows no accept/dismiss controls once an item has left `new`', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'in-progress' })]);
    renderQueue();
    await openItem();
    expect(screen.queryByRole('button', { name: /^accept$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^dismiss$/i })).not.toBeInTheDocument();
  });

  it('marks an item whose reporter was erased (FR-FL-060)', async () => {
    mockQueue.mockResolvedValue([item({ reporterErasedAt: '2026-08-25T00:00:00Z' })]);
    renderQueue();
    expect(await screen.findByText(/reporter erased/i)).toBeInTheDocument();
  });

  it('attributes every row to its author (FR-AD-009)', async () => {
    mockQueue.mockResolvedValue([item(), item({ _id: 'i2', userId: 'reporter-2' })]);
    renderQueue();
    expect(await screen.findByTestId('triage-author-i1')).toHaveTextContent('reporter-1');
    expect(screen.getByTestId('triage-author-i2')).toHaveTextContent('reporter-2');
  });

  it('opens the reporter’s kitchen from the item (FR-AD-015)', async () => {
    renderQueue();
    await openItem();
    await userEvent.click(screen.getByRole('button', { name: 'reporter-1' }));
    expect(onSelectUser).toHaveBeenCalledWith('reporter-1');
  });

  it('opens an item as a dialog, dismissable by Escape', async () => {
    renderQueue();
    await openItem();
    const dialog = screen.getByRole('dialog');
    // The shared Overlay: bottom sheet on touch, centred dialog on desktop, focus trapped.
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cannot open a draft — it has no lifecycle item yet', async () => {
    mockQueue.mockResolvedValue([]);
    renderQueue([draft({ title: 'Abandoned halfway' })]);
    await userEvent.click(await screen.findByRole('button', { name: /abandoned halfway/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /** FR-FL-020 — editable only before briefing, since clauses are derived from this text. */
  it('offers Edit details before briefing, and not after', async () => {
    renderQueue();
    await openItem();
    expect(screen.getByRole('button', { name: /edit details/i })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    mockQueue.mockResolvedValue([item({ stage: 'in-spec' })]);
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await openItem();
    expect(screen.queryByRole('button', { name: /edit details/i })).not.toBeInTheDocument();
  });

  it('edits the report’s structured fields (FR-FL-020)', async () => {
    renderQueue();
    await openItem();
    await userEvent.click(screen.getByRole('button', { name: /edit details/i }));

    const title = screen.getByLabelText(/^title$/i);
    await userEvent.clear(title);
    await userEvent.type(title, 'Clearer title');
    await userEvent.click(screen.getByRole('button', { name: /save details/i }));

    await waitFor(() =>
      expect(mockAct).toHaveBeenCalledWith('i1', {
        action: 'edit-source',
        sourceTitle: 'Clearer title',
        sourceAffectedArea: 'grocery',
      }),
    );
  });

  it('ranks an item so the queue can be ordered (FR-FL-022)', async () => {
    renderQueue();
    await openItem();
    await userEvent.click(screen.getByRole('button', { name: /edit details/i }));

    await userEvent.type(screen.getByLabelText(/^rank$/i), '3');
    await userEvent.click(screen.getByRole('button', { name: /set rank/i }));

    await waitFor(() => expect(mockAct).toHaveBeenCalledWith('i1', { action: 'set-rank', rank: 3 }));
  });
});

/**
 * The filter regression of 2026-08-26. Triage carried two lists — records filtered by `status`,
 * and this queue below, which ignored the filter. Changing the filter emptied one list and left
 * the other untouched, which is indistinguishable from a filter that does nothing.
 */
describe('TriageQueue — filtering by stage (FR-AD-009)', () => {
  it('narrows the list to one stage', async () => {
    mockQueue.mockResolvedValue([
      item({ _id: 'i1', sourceTitle: 'Still new' }),
      item({ _id: 'i2', sourceTitle: 'Already shipped', stage: 'shipped' }),
    ]);
    renderQueue();
    await screen.findByText('Still new');

    await userEvent.click(screen.getByRole('button', { name: /^shipped \(1\)$/i }));

    expect(screen.getByText('Already shipped')).toBeInTheDocument();
    expect(screen.queryByText('Still new')).not.toBeInTheDocument();
  });

  it('offers a chip only for a stage that has items', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'shipped' })]);
    renderQueue();
    await screen.findByText('Grocery rows duplicate');
    // A filter that can only ever return nothing is noise — there are twelve possible stages.
    expect(screen.getByRole('button', { name: /^shipped \(1\)$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^parked/i })).not.toBeInTheDocument();
  });

  it('keeps not-yet-enqueued drafts reachable', async () => {
    // A record that never completes has no lifecycle item (FR-FL-001). Dropping `draft` would
    // make abandoned conversations unreachable from the admin surface entirely.
    renderQueue([draft({ title: 'Abandoned halfway' })]);
    expect(await screen.findByText('Abandoned halfway')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^draft \(1\)$/i }));
    expect(screen.getByText('Abandoned halfway')).toBeInTheDocument();
    expect(screen.queryByText('Grocery rows duplicate')).not.toBeInTheDocument();
  });

  it('offers no lifecycle action on a draft — it has no item yet', async () => {
    mockQueue.mockResolvedValue([]);
    renderQueue([draft({ title: 'Abandoned halfway' })]);
    await screen.findByText('Abandoned halfway');
    expect(screen.queryByRole('button', { name: /^accept$/i })).not.toBeInTheDocument();
  });

  it('says the stage is empty rather than that nothing was ever reported', async () => {
    mockQueue.mockResolvedValue([item({ stage: 'shipped' })]);
    renderQueue();
    await screen.findByText('Grocery rows duplicate');
    await userEvent.click(screen.getByRole('button', { name: /^all \(1\)$/i }));
    expect(screen.queryByText(/no feedback reports yet/i)).not.toBeInTheDocument();
  });
});
