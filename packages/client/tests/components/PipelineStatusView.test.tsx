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
// The transition controls are administrator-only (`PATCH /pipeline/:id` ->
// requirePrincipalAdmin), so `useIsAdmin()` -> `useMe()` -> this call decides whether they
// render. The view itself is NOT gated — `GET /pipeline` is plain `authenticate()`.
vi.mock('../../src/services/admin', () => ({
  fetchMe: vi.fn(),
}));

import { fetchPipeline, transitionPipelineItem } from '../../src/services/pipeline';
import { fetchMe } from '../../src/services/admin';

const mockFetch = vi.mocked(fetchPipeline);
const mockTransition = vi.mocked(transitionPipelineItem);
const mockMe = vi.mocked(fetchMe);

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
  // These cases are about the transitions themselves, so they run AS an administrator.
  // The refusal cases are asserted explicitly at the end of the describe block.
  mockMe.mockResolvedValue({ userId: 'u1', isAdmin: true });
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
          {
            type: 'pull-request',
            ref: 'https://github.com/org/repo/pull/42',
            at: '2026-07-23T10:00:00Z',
          },
        ],
      }),
    ]);
    setup();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /draft spec/i })).toHaveAttribute(
        'href',
        'specs/010-foo/spec.md',
      ),
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
    await waitFor(() =>
      expect(mockTransition).toHaveBeenCalledWith('p1', { action: 'approve-spec' }),
    );
  });

  it('the Approve release control calls transition with approve-release for an in-review item', async () => {
    mockFetch.mockResolvedValue([item({ stage: 'in-review' })]);
    mockTransition.mockResolvedValueOnce(asFullItem(item({ stage: 'shipped' })));
    setup();
    const btn = await screen.findByRole('button', { name: /approve release/i });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(mockTransition).toHaveBeenCalledWith('p1', { action: 'approve-release' }),
    );
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

  // The regression this covers: every transition button rendered for any authenticated
  // user, but `PATCH /pipeline/:id` is behind `requirePrincipalAdmin`, so a reporter
  // clicking one got a 403 reported as "Please try again", which misstates the reason.
  it('hides the transition controls from a non-admin reporter (FR-AD-002)', async () => {
    mockMe.mockResolvedValue({ userId: 'u1', isAdmin: false });
    mockFetch.mockResolvedValue([item({ stage: 'in-spec' })]);
    setup();

    // Wait for the row, so this cannot pass merely because nothing has rendered yet.
    expect(await screen.findByText('Grocery count wrong')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve spec/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^park$/i })).not.toBeInTheDocument();
  });

  // Deliberately NOT gated as a whole: `GET /pipeline` is behind plain `authenticate()`,
  // and a reporter seeing the stage their own report reached is the point of this view.
  // Gating the section rather than the buttons would remove a capability reporters have.
  it('still shows the stage to a non-admin reporter — only the controls are gated', async () => {
    mockMe.mockResolvedValue({ userId: 'u1', isAdmin: false });
    mockFetch.mockResolvedValue([item({ stage: 'in-spec' })]);
    setup();

    expect(await screen.findByText('Grocery count wrong')).toBeInTheDocument();
    expect(screen.getByTestId('stage-badge-p1')).toHaveTextContent(/in spec/i);
  });

  it('renders no transition control while the privilege answer is still pending', async () => {
    mockMe.mockReturnValue(new Promise(() => {})); // never settles
    mockFetch.mockResolvedValue([item({ stage: 'in-spec' })]);
    setup();

    expect(await screen.findByText('Grocery count wrong')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve spec/i })).not.toBeInTheDocument();
  });
});
