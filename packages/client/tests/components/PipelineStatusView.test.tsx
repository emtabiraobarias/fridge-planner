import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineProvider } from '../../src/context/PipelineContext';
import { PipelineStatusView } from '../../src/components/feedback/PipelineStatusView';
import type { PipelineItem, PipelineItemSummary } from '../../src/services/pipeline';

vi.mock('../../src/services/pipeline', () => ({
  fetchPipeline: vi.fn(),
  promoteFeedback: vi.fn(),
  transitionPipelineItem: vi.fn(),
}));

import { fetchPipeline, transitionPipelineItem } from '../../src/services/pipeline';

const mockFetch = vi.mocked(fetchPipeline);
const mockTransition = vi.mocked(transitionPipelineItem);

function item(overrides: Partial<PipelineItemSummary> = {}): PipelineItemSummary {
  return {
    _id: 'p1',
    feedbackRecordId: 'f1',
    stage: 'approved',
    sourceTitle: 'Grocery count wrong',
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    artifacts: [],
    promotedAt: '2026-07-23T10:00:00Z',
    updatedAt: '2026-07-23T10:00:00Z',
    ...overrides,
  };
}

function asFullItem(summary: PipelineItemSummary): PipelineItem {
  return {
    ...summary,
    promotedBy: 'u1',
    transitions: [],
    createdAt: summary.promotedAt,
  };
}

function setup(): void {
  render(
    <PipelineProvider>
      <PipelineStatusView />
    </PipelineProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PipelineStatusView', () => {
  it('renders one row per item with a text+icon stage badge (not color-only, WCAG 2.1 AA)', async () => {
    mockFetch.mockResolvedValue([item({ stage: 'in-review' })]);
    setup();
    await waitFor(() => expect(screen.getByText('Grocery count wrong')).toBeInTheDocument());
    const badge = screen.getByTestId('stage-badge-p1');
    expect(badge).toHaveTextContent(/in review/i);
    // Decorative icon accompanies the text label — the label alone (not color) conveys the stage.
    expect(badge.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('renders draft-spec and pull-request artifact links when present', async () => {
    mockFetch.mockResolvedValue([
      item({
        stage: 'in-review',
        artifacts: [
          { type: 'draft-spec', ref: 'specs/010-foo/spec.md', at: '2026-07-23T10:00:00Z' },
          { type: 'pull-request', ref: 'https://github.com/org/repo/pull/42', at: '2026-07-23T10:00:00Z' },
        ],
      }),
    ]);
    setup();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /draft spec/i })).toHaveAttribute('href', 'specs/010-foo/spec.md'),
    );
    expect(screen.getByRole('link', { name: /pull request/i })).toHaveAttribute(
      'href',
      'https://github.com/org/repo/pull/42',
    );
  });

  it('the Approve spec control calls transition with approve-spec for an in-spec item', async () => {
    mockFetch.mockResolvedValue([item({ stage: 'in-spec' })]);
    mockTransition.mockResolvedValueOnce(asFullItem(item({ stage: 'in-review' })));
    setup();
    const btn = await screen.findByRole('button', { name: /approve spec/i });
    fireEvent.click(btn);
    await waitFor(() => expect(mockTransition).toHaveBeenCalledWith('p1', { action: 'approve-spec' }));
  });

  it('the Approve release control calls transition with approve-release for an in-review item', async () => {
    mockFetch.mockResolvedValue([item({ stage: 'in-review' })]);
    mockTransition.mockResolvedValueOnce(asFullItem(item({ stage: 'shipped' })));
    setup();
    const btn = await screen.findByRole('button', { name: /approve release/i });
    fireEvent.click(btn);
    await waitFor(() => expect(mockTransition).toHaveBeenCalledWith('p1', { action: 'approve-release' }));
  });

  it('the Park control calls transition with park', async () => {
    mockFetch.mockResolvedValue([item({ stage: 'in-spec' })]);
    mockTransition.mockResolvedValueOnce(asFullItem(item({ stage: 'parked' })));
    setup();
    const btn = await screen.findByRole('button', { name: /^park$/i });
    fireEvent.click(btn);
    await waitFor(() => expect(mockTransition).toHaveBeenCalledWith('p1', { action: 'park' }));
  });

  it('the Reopen control calls transition with reopen for a parked item', async () => {
    mockFetch.mockResolvedValue([item({ stage: 'parked' })]);
    mockTransition.mockResolvedValueOnce(asFullItem(item({ stage: 'in-spec' })));
    setup();
    const btn = await screen.findByRole('button', { name: /reopen/i });
    fireEvent.click(btn);
    await waitFor(() => expect(mockTransition).toHaveBeenCalledWith('p1', { action: 'reopen' }));
  });

  it('gate/park/reopen controls are real, focusable, keyboard-operable buttons', async () => {
    mockFetch.mockResolvedValue([item({ stage: 'in-spec' })]);
    setup();
    const btn = await screen.findByRole('button', { name: /approve spec/i });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).not.toBeDisabled();
    btn.focus();
    expect(btn).toHaveFocus();
  });
});
