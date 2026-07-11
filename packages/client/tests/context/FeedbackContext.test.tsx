import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedbackProvider, useFeedback } from '../../src/context/FeedbackContext';
import type { FeedbackTurn } from '../../src/services/feedback';

vi.mock('../../src/services/feedback', () => ({
  startFeedback: vi.fn(),
  sendFeedbackMessage: vi.fn(),
  fetchFeedbackList: vi.fn(),
  deleteFeedbackRecord: vi.fn(),
}));

import {
  startFeedback,
  sendFeedbackMessage,
  fetchFeedbackList,
  deleteFeedbackRecord,
} from '../../src/services/feedback';

const mockStart = vi.mocked(startFeedback);
const mockSend = vi.mocked(sendFeedbackMessage);
const mockList = vi.mocked(fetchFeedbackList);
const mockDelete = vi.mocked(deleteFeedbackRecord);

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
    createdAt: '2026-07-11T10:00:00Z',
    updatedAt: '2026-07-11T10:02:00Z',
    transcript: [],
  },
};

function Harness(): React.JSX.Element {
  const { chatState, messages, completedRecord, error, send, records, refreshList, remove } = useFeedback();
  return (
    <div>
      <span data-testid="state">{chatState}</span>
      <span data-testid="msgcount">{messages.length}</span>
      <span data-testid="title">{completedRecord?.title ?? ''}</span>
      <span data-testid="error">{error}</span>
      <span data-testid="records">{records.length}</span>
      <button onClick={() => void send('grocery broken')}>send</button>
      <button onClick={() => void refreshList()}>list</button>
      <button onClick={() => void remove('f1')}>remove</button>
    </div>
  );
}

function setup(): void {
  render(
    <FeedbackProvider>
      <Harness />
    </FeedbackProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockList.mockResolvedValue([]);
});

describe('FeedbackContext', () => {
  it('starts idle', () => {
    setup();
    expect(screen.getByTestId('state').textContent).toBe('idle');
  });

  it('transitions idle → awaiting-user on a collecting reply and shows the transcript', async () => {
    mockStart.mockResolvedValueOnce(collectingTurn);
    setup();
    act(() => screen.getByText('send').click());
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('awaiting-user'));
    expect(screen.getByTestId('msgcount').textContent).toBe('2');
    expect(mockStart).toHaveBeenCalledWith('grocery broken');
  });

  it('transitions to complete and exposes the completed record', async () => {
    mockStart.mockResolvedValueOnce(completeTurn);
    setup();
    act(() => screen.getByText('send').click());
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('complete'));
    expect(screen.getByTestId('title').textContent).toBe('Grocery count wrong');
  });

  it('uses the conversation id for the second turn (continue, not start)', async () => {
    mockStart.mockResolvedValueOnce(collectingTurn);
    mockSend.mockResolvedValueOnce(completeTurn);
    setup();
    act(() => screen.getByText('send').click());
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('awaiting-user'));
    act(() => screen.getByText('send').click());
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('f1', 'grocery broken'));
  });

  it('goes to error and keeps the optimistic user message on failure (US1-S3)', async () => {
    mockStart.mockRejectedValueOnce(new Error('agent down'));
    setup();
    act(() => screen.getByText('send').click());
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('error'));
    expect(screen.getByTestId('msgcount').textContent).toBe('1');
    expect(screen.getByTestId('error').textContent).toMatch(/agent down/i);
  });

  it('loads the review list and removes a record', async () => {
    mockList.mockResolvedValue([completeTurn.feedback]);
    mockDelete.mockResolvedValueOnce();
    setup();
    act(() => screen.getByText('list').click());
    await waitFor(() => expect(screen.getByTestId('records').textContent).toBe('1'));
    act(() => screen.getByText('remove').click());
    await waitFor(() => expect(screen.getByTestId('records').textContent).toBe('0'));
    expect(mockDelete).toHaveBeenCalledWith('f1');
  });
});
