import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedbackProvider } from '../../src/context/FeedbackContext';
import { FeedbackPage } from '../../src/views/FeedbackPage';
import type { FeedbackTurn } from '../../src/services/feedback';

vi.mock('../../src/services/feedback', () => ({
  startFeedback: vi.fn(),
  sendFeedbackMessage: vi.fn(),
  fetchFeedbackList: vi.fn(),
  deleteFeedbackRecord: vi.fn(),
  fetchFeedbackExport: vi.fn(),
}));

import {
  startFeedback,
  fetchFeedbackList,
} from '../../src/services/feedback';

const mockStart = vi.mocked(startFeedback);
const mockList = vi.mocked(fetchFeedbackList);

const collectingTurn: FeedbackTurn = {
  status: 'draft',
  reply: 'What did you expect to happen?',
  feedback: {
    _id: 'f1',
    status: 'draft',
    createdAt: '2026-07-11T10:00:00Z',
    updatedAt: '2026-07-11T10:00:00Z',
    transcript: [
      { role: 'user', content: 'grocery broken', at: '2026-07-11T10:00:00Z' },
      { role: 'agent', content: 'What did you expect to happen?', at: '2026-07-11T10:00:01Z' },
    ],
  },
};

const completeTurn: FeedbackTurn = {
  status: 'complete',
  reply: 'Logged it.',
  feedback: {
    _id: 'f1',
    status: 'complete',
    type: 'bug',
    title: 'Grocery count wrong',
    priority: 'P2',
    affectedArea: 'grocery',
    createdAt: '2026-07-11T10:00:00Z',
    updatedAt: '2026-07-11T10:02:00Z',
    transcript: [],
  },
};

function setup(): void {
  render(
    <FeedbackProvider>
      <FeedbackPage />
    </FeedbackProvider>,
  );
}

async function type(text: string): Promise<void> {
  const box = screen.getByLabelText('Your message');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.submit(box.closest('form')!);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
});

describe('FeedbackPage', () => {
  it('renders the conversation log with an accessible role', () => {
    setup();
    expect(screen.getByRole('log', { name: /feedback conversation/i })).toBeInTheDocument();
  });

  it('shows the assistant question after sending a message', async () => {
    mockStart.mockResolvedValueOnce(collectingTurn);
    setup();
    await act(async () => { await type('grocery broken'); });
    await waitFor(() => expect(screen.getByText('What did you expect to happen?')).toBeInTheDocument());
    expect(mockStart).toHaveBeenCalledWith('grocery broken');
  });

  it('renders the completion card (and hides the input) when the record completes', async () => {
    mockStart.mockResolvedValueOnce(completeTurn);
    setup();
    await act(async () => { await type('everything is broken'); });
    await waitFor(() => expect(screen.getByText(/your feedback is saved/i)).toBeInTheDocument());
    expect(screen.getByText('Grocery count wrong')).toBeInTheDocument();
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();
  });

  it('shows a retryable error and keeps the composer on agent failure', async () => {
    mockStart.mockRejectedValueOnce(new Error('agent down'));
    setup();
    await act(async () => { await type('broken'); });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/try again/i));
    expect(screen.getByLabelText('Your message')).toBeInTheDocument();
  });

  it('renders the history list from the service', async () => {
    mockList.mockResolvedValue([completeTurn.feedback]);
    setup();
    await waitFor(() => expect(screen.getByText('Grocery count wrong')).toBeInTheDocument());
    expect(screen.getByRole('region', { name: /your feedback history/i })).toBeInTheDocument();
  });
});
