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
// Promotion is administrator-only (`POST /feedback/:id/promote` -> requirePrincipalAdmin),
// so `useIsAdmin()` -> `useMe()` -> this call now decides whether the button renders.
vi.mock('../../src/services/admin', () => ({
  fetchMe: vi.fn(),
}));

import { fetchPipeline, promoteFeedback } from '../../src/services/pipeline';
import { fetchMe } from '../../src/services/admin';

const mockFetch = vi.mocked(fetchPipeline);
const mockPromote = vi.mocked(promoteFeedback);
const mockMe = vi.mocked(fetchMe);

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
  // These cases are about the promote behaviour itself, so they run AS an administrator.
  // The refusal case is asserted explicitly at the end of the describe block.
  mockMe.mockResolvedValue({ userId: 'u1', isAdmin: true });
});

describe('PromoteButton', () => {
  it('renders and calls promote(feedbackId) on click for a completed record', async () => {
    mockPromote.mockResolvedValueOnce(promotedItem);
    setup(completedRecord);
    // `findBy`, not `getBy`: the button is now gated on `useIsAdmin()`, so it appears only
    // once /api/v1/me has answered rather than on the first synchronous render.
    const btn = await screen.findByRole('button', { name: /promote to development/i });
    fireEvent.click(btn);
    await waitFor(() => expect(mockPromote).toHaveBeenCalledWith('f1'));
  });

  it('is absent for a draft record', () => {
    setup(draftRecord);
    expect(
      screen.queryByRole('button', { name: /promote to development/i }),
    ).not.toBeInTheDocument();
  });

  // The regression this covers: the button rendered for every authenticated user, but
  // `POST /feedback/:id/promote` is behind `requirePrincipalAdmin`, so a reporter clicking
  // it could only ever get a 403 — surfaced as "Could not promote this record. Please try
  // again", which misstates the reason. Nothing caught it because no requirement existed.
  it('is absent for a non-admin reporter — the route is admin-only (FR-AD-002)', async () => {
    mockMe.mockResolvedValue({ userId: 'u1', isAdmin: false });
    setup(completedRecord);
    await waitFor(() => expect(mockMe).toHaveBeenCalled());
    expect(
      screen.queryByRole('button', { name: /promote to development/i }),
    ).not.toBeInTheDocument();
  });

  // `useIsAdmin()` is null until /api/v1/me answers; a control that appears then vanishes
  // is worse than one that arrives late, so nothing may render in that window.
  it('renders nothing while the privilege answer is still pending', () => {
    mockMe.mockReturnValue(new Promise(() => {})); // never settles
    setup(completedRecord);
    expect(
      screen.queryByRole('button', { name: /promote to development/i }),
    ).not.toBeInTheDocument();
  });
});
