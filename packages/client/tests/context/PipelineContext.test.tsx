import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineProvider, usePipeline } from '../../src/context/PipelineContext';
import type { PipelineItem, PipelineItemSummary } from '../../src/services/pipeline';

vi.mock('../../src/services/pipeline', () => ({
  fetchPipeline: vi.fn(),
  promoteFeedback: vi.fn(),
  transitionPipelineItem: vi.fn(),
}));

import { fetchPipeline, promoteFeedback, transitionPipelineItem } from '../../src/services/pipeline';

const mockFetch = vi.mocked(fetchPipeline);
const mockPromote = vi.mocked(promoteFeedback);
const mockTransition = vi.mocked(transitionPipelineItem);

const summaryA: PipelineItemSummary = {
  _id: 'p1',
  feedbackRecordId: 'f1',
  stage: 'approved',
  sourceTitle: 'Grocery count wrong',
  sourceType: 'bug',
  sourceAffectedArea: 'grocery',
  artifacts: [],
  promotedAt: '2026-07-23T10:00:00Z',
  updatedAt: '2026-07-23T10:00:00Z',
};

const fullItem: PipelineItem = {
  ...summaryA,
  stage: 'in-spec',
  promotedBy: 'u1',
  transitions: [
    { from: null, to: 'approved', actor: 'human', at: '2026-07-23T10:00:00Z', isGateApproval: true },
    { from: 'approved', to: 'in-spec', actor: 'session', at: '2026-07-23T10:05:00Z', isGateApproval: false },
  ],
  createdAt: '2026-07-23T10:00:00Z',
};

function Harness(): React.JSX.Element {
  const { items, loading, refresh, promote, transition } = usePipeline();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="count">{items.length}</span>
      <span data-testid="stage0">{items[0]?.stage ?? ''}</span>
      <button onClick={() => void refresh()}>refresh</button>
      <button onClick={() => void promote('f1')}>promote</button>
      <button onClick={() => void transition('p1', { action: 'advance' })}>transition</button>
    </div>
  );
}

function setup(): void {
  render(
    <PipelineProvider>
      <Harness />
    </PipelineProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue([]);
});

describe('PipelineContext', () => {
  it('starts with an empty list, not loading', () => {
    setup();
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('loading').textContent).toBe('false');
  });

  it('refresh() populates items from GET /pipeline', async () => {
    mockFetch.mockResolvedValue([summaryA]);
    setup();
    act(() => screen.getByText('refresh').click());
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(screen.getByTestId('stage0').textContent).toBe('approved');
  });

  it('promote(feedbackId) calls the promote service and the resulting item appears in items', async () => {
    mockPromote.mockResolvedValueOnce(fullItem);
    mockFetch.mockResolvedValueOnce([fullItem]);
    setup();
    act(() => screen.getByText('promote').click());
    await waitFor(() => expect(mockPromote).toHaveBeenCalledWith('f1'));
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));
    expect(screen.getByTestId('stage0').textContent).toBe('in-spec');
  });

  it('transition(id, body) calls the PATCH service and updates the matching item in place', async () => {
    mockFetch.mockResolvedValueOnce([summaryA]);
    setup();
    act(() => screen.getByText('refresh').click());
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('1'));

    mockTransition.mockResolvedValueOnce(fullItem);
    mockFetch.mockResolvedValueOnce([fullItem]);
    act(() => screen.getByText('transition').click());
    await waitFor(() => expect(mockTransition).toHaveBeenCalledWith('p1', { action: 'advance' }));
    await waitFor(() => expect(screen.getByTestId('stage0').textContent).toBe('in-spec'));
  });
});
