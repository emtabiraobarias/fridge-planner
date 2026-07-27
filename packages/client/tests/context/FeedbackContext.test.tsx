import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedbackProvider, useFeedback } from '../../src/context/FeedbackContext';
import type { FeedbackTurn } from '../../src/services/feedback';

vi.mock('../../src/services/feedback', () => ({
  startFeedback: vi.fn(),
  sendFeedbackMessage: vi.fn(),
  fetchFeedbackList: vi.fn(),
  deleteFeedbackRecord: vi.fn(),
  fetchFeedbackRecord: vi.fn(),
}));

import {
  startFeedback,
  sendFeedbackMessage,
  fetchFeedbackList,
  deleteFeedbackRecord,
  fetchFeedbackRecord,
} from '../../src/services/feedback';

const mockStart = vi.mocked(startFeedback);
const mockSend = vi.mocked(sendFeedbackMessage);
const mockList = vi.mocked(fetchFeedbackList);
const mockDelete = vi.mocked(deleteFeedbackRecord);
const mockGet = vi.mocked(fetchFeedbackRecord);

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
  const {
    chatState,
    messages,
    completedRecord,
    error,
    send,
    records,
    refreshList,
    remove,
    resume,
    listError,
  } = useFeedback();
  return (
    <div>
      <span data-testid="state">{chatState}</span>
      <span data-testid="msgcount">{messages.length}</span>
      <span data-testid="title">{completedRecord?.title ?? ''}</span>
      <span data-testid="error">{error}</span>
      <span data-testid="records">{records.length}</span>
      <button onClick={() => void send('grocery broken')}>send</button>
      <button onClick={() => void refreshList()}>list</button>
      <span data-testid="listerror">{listError}</span>
      <button onClick={() => void remove('f1')}>remove</button>
      <button onClick={() => void resume('f1')}>resume</button>
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

/**
 * Resuming a draft has been required since FR-F-012 / US3-S1, but the shipped UI never
 * wired it — `fetchFeedbackRecord` sat unused in the service layer, leaving Delete as a
 * draft's only action. These lock the behaviour in.
 */
describe('resuming a stored record (FR-F-012, US3-S1)', () => {
  it('reopens a draft with its transcript and accepts further messages', async () => {
    mockGet.mockResolvedValue(collectingTurn.feedback);
    setup();
    await act(async () => {
      screen.getByText('resume').click();
    });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('awaiting-user'));
    // The stored transcript is the context the backend replays to the assistant.
    expect(screen.getByTestId('msgcount').textContent).toBe('2');
  });

  it('reopens a completed record read-only rather than as a live conversation (US3-S3)', async () => {
    mockGet.mockResolvedValue(completeTurn.feedback);
    setup();
    await act(async () => {
      screen.getByText('resume').click();
    });
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('complete'));
    expect(screen.getByTestId('title').textContent).toBe('Grocery count wrong');
  });

  it('surfaces a failure to reopen instead of failing silently', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    setup();
    await act(async () => {
      screen.getByText('resume').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('listerror').textContent).toMatch(/could not reopen/i),
    );
  });
});

/** FR-F-021: failures must be visible, and never mistaken for emptiness. */
describe('failures are surfaced, not swallowed', () => {
  it('reports a refused delete and keeps the record in the list', async () => {
    mockList.mockResolvedValue([completeTurn.feedback]);
    mockDelete.mockRejectedValue(
      new Error(
        'This feedback is already in development. Park it in the pipeline first, then delete.',
      ),
    );
    setup();
    await act(async () => {
      screen.getByText('list').click();
    });
    await waitFor(() => expect(screen.getByTestId('records').textContent).toBe('1'));

    await act(async () => {
      screen.getByText('remove').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('listerror').textContent).toMatch(/already in development/i),
    );
    // The row must NOT disappear when the server refused to delete it.
    expect(screen.getByTestId('records').textContent).toBe('1');
  });

  it('reports a failed list load rather than leaving the list looking empty', async () => {
    mockList.mockRejectedValue(new Error('offline'));
    setup();
    await act(async () => {
      screen.getByText('list').click();
    });
    await waitFor(() =>
      expect(screen.getByTestId('listerror').textContent).toMatch(/could not load/i),
    );
  });
});
