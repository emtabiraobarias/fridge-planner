import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedbackProvider } from '../../../src/context/FeedbackContext';
import { PipelineProvider } from '../../../src/context/PipelineContext';
import { FeedbackHistory } from '../../../src/components/feedback/FeedbackHistory';
import type { FeedbackRecord } from '../../../src/services/feedback';

vi.mock('../../../src/services/feedback', () => ({
  startFeedback: vi.fn(),
  sendFeedbackMessage: vi.fn(),
  fetchFeedbackList: vi.fn(),
  deleteFeedbackRecord: vi.fn(),
  fetchFeedbackRecord: vi.fn(),
  fetchFeedbackExport: vi.fn(),
}));
// PromoteButton reads the pipeline; it is not what these tests are about.
vi.mock('../../../src/services/pipeline', () => ({
  fetchPipeline: vi.fn().mockResolvedValue([]),
  promoteFeedbackRecord: vi.fn(),
  patchPipelineItem: vi.fn(),
  fetchPipelineItem: vi.fn(),
}));

import {
  fetchFeedbackList,
  fetchFeedbackRecord,
  deleteFeedbackRecord,
} from '../../../src/services/feedback';

const mockList = vi.mocked(fetchFeedbackList);
const mockGet = vi.mocked(fetchFeedbackRecord);
const mockDelete = vi.mocked(deleteFeedbackRecord);

function record(over: Partial<FeedbackRecord> = {}): FeedbackRecord {
  return {
    _id: 'f1',
    status: 'draft',
    createdAt: '2026-07-28T10:00:00Z',
    updatedAt: '2026-07-28T10:00:00Z',
    transcript: [{ role: 'user', content: 'grocery broken', at: '2026-07-28T10:00:00Z' }],
    ...over,
  } as FeedbackRecord;
}

function setup(): void {
  render(
    <FeedbackProvider>
      <PipelineProvider>
        <FeedbackHistory />
      </PipelineProvider>
    </FeedbackProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
});

describe('FeedbackHistory', () => {
  it('offers Continue on a draft, so a draft is never a dead end (FR-F-012, SC-F-009)', async () => {
    mockList.mockResolvedValue([record()]);
    mockGet.mockResolvedValue(record());
    setup();

    const cont = await screen.findByRole('button', { name: /continue/i });
    await userEvent.click(cont);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('f1'));
  });

  it('offers Export instead of Continue once a record is complete (FR-F-007)', async () => {
    mockList.mockResolvedValue([record({ status: 'complete', title: 'Dupe rows' })]);
    setup();

    expect(await screen.findByRole('button', { name: /export/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
  });

  it('shows a refused delete and keeps the row (FR-F-021)', async () => {
    mockList.mockResolvedValue([record({ status: 'complete', title: 'Dupe rows' })]);
    mockDelete.mockRejectedValue(
      new Error('This feedback is already in development. Park it in the pipeline first, then delete.'),
    );
    setup();

    await userEvent.click(await screen.findByRole('button', { name: /delete feedback/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already in development/i);
    // The row must survive a refused delete.
    expect(screen.getByText('Dupe rows')).toBeInTheDocument();
  });

  it('never presents a failed load as "no feedback yet" (FR-F-021, SC-F-010)', async () => {
    mockList.mockRejectedValue(new Error('offline'));
    setup();

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your feedback/i);
    expect(screen.queryByText(/haven’t submitted any feedback yet/i)).not.toBeInTheDocument();
  });

  it('still shows the empty state when the load genuinely returns nothing', async () => {
    mockList.mockResolvedValue([]);
    setup();

    expect(await screen.findByText(/haven’t submitted any feedback yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
