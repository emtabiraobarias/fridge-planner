import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineProvider } from '../../src/context/PipelineContext';
import { PromoteButton } from '../../src/components/feedback/PromoteButton';
import type { FeedbackRecord } from '../../src/services/feedback';
import type { PipelineItem } from '../../src/services/pipeline';

vi.mock('../../src/services/pipeline', () => ({
  fetchPipeline: vi.fn(),
  promoteFeedback: vi.fn(),
  transitionPipelineItem: vi.fn(),
}));

import { fetchPipeline, promoteFeedback } from '../../src/services/pipeline';

const mockFetch = vi.mocked(fetchPipeline);
const mockPromote = vi.mocked(promoteFeedback);

const completedRecord: FeedbackRecord = {
  _id: 'f1',
  status: 'complete',
  type: 'bug',
  title: 'Grocery count wrong',
  createdAt: '2026-07-23T10:00:00Z',
  updatedAt: '2026-07-23T10:00:00Z',
};

const draftRecord: FeedbackRecord = {
  _id: 'f2',
  status: 'draft',
  createdAt: '2026-07-23T10:00:00Z',
  updatedAt: '2026-07-23T10:00:00Z',
};

const promotedItem: PipelineItem = {
  _id: 'p1',
  feedbackRecordId: 'f1',
  stage: 'approved',
  sourceTitle: 'Grocery count wrong',
  sourceType: 'bug',
  sourceAffectedArea: 'grocery',
  artifacts: [],
  promotedAt: '2026-07-23T10:00:00Z',
  updatedAt: '2026-07-23T10:00:00Z',
  promotedBy: 'u1',
  transitions: [],
  createdAt: '2026-07-23T10:00:00Z',
};

function setup(record: FeedbackRecord): void {
  render(
    <PipelineProvider>
      <PromoteButton record={record} />
    </PipelineProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue([]);
});

describe('PromoteButton', () => {
  it('renders and calls promote(feedbackId) on click for a completed record', async () => {
    mockPromote.mockResolvedValueOnce(promotedItem);
    setup(completedRecord);
    const btn = screen.getByRole('button', { name: /promote to development/i });
    fireEvent.click(btn);
    await waitFor(() => expect(mockPromote).toHaveBeenCalledWith('f1'));
  });

  it('is absent for a draft record', () => {
    setup(draftRecord);
    expect(screen.queryByRole('button', { name: /promote to development/i })).not.toBeInTheDocument();
  });
});
