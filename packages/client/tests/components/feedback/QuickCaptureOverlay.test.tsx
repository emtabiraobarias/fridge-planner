import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRouter } from 'next/navigation';
import { QuickCaptureOverlay } from '../../../src/components/feedback/QuickCaptureOverlay';
import { ToastProvider } from '../../../src/context/ToastContext';
import { Toast } from '../../../src/components/shared/Toast';

vi.mock('../../../src/services/feedback', () => ({
  startFeedback: vi.fn(),
  // A real class, not a stub: the component branches on `instanceof`.
  FeedbackAgentUnavailableError: class FeedbackAgentUnavailableError extends Error {},
}));

import { startFeedback, FeedbackAgentUnavailableError } from '../../../src/services/feedback';

const mockStart = vi.mocked(startFeedback);

describe('QuickCaptureOverlay (design §5.4, research D11, FR-RS-006/023)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<QuickCaptureOverlay open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('starts a feedback record, tagging the message with the selected category, and closes on send', async () => {
    mockStart.mockResolvedValue({
      feedback: { _id: 'f1', status: 'collecting' as never, createdAt: '', updatedAt: '' } as never,
      status: 'collecting' as never,
      reply: 'Thanks!',
    });
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <QuickCaptureOverlay open onClose={onClose} />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /bug/i }));
    await user.type(screen.getByPlaceholderText(/what's on your mind/i), 'The stepper is broken');
    await user.click(screen.getByRole('button', { name: /send it/i }));

    await waitFor(() => expect(mockStart).toHaveBeenCalledWith('[Bug] The stepper is broken'));
    expect(onClose).toHaveBeenCalled();
  });

  it('links out to the full /feedback surface without displacing it', () => {
    render(<QuickCaptureOverlay open onClose={vi.fn()} />);
    expect(screen.getByRole('link', { name: /open full feedback/i })).toHaveAttribute(
      'href',
      '/feedback',
    );
  });

  it('disables Send it until there is text', () => {
    render(<QuickCaptureOverlay open onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /send it/i })).toBeDisabled();
  });
});

/**
 * The behaviour the original coverage missed entirely. The prior test asserted only the
 * message payload and that the overlay closed — so it passed happily while the user was
 * told "Thanks — we hear you" about a record that was still an unusable draft. These
 * assert the OUTCOME instead (FR-F-019, US5).
 */
describe('unfinished notes are handed off, not declared filed (FR-F-019)', () => {
  function pushSpy(): ReturnType<typeof vi.fn> {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
    } as never);
    return push;
  }

  async function send(text = 'The stepper is broken'): Promise<void> {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/what's on your mind/i), text);
    await user.click(screen.getByRole('button', { name: /send it/i }));
  }

  it('routes into the conversation when the assistant needs more detail', async () => {
    const push = pushSpy();
    // What the live assistant actually returns for a first message: a clarifying question.
    mockStart.mockResolvedValue({
      feedback: { _id: 'f9', status: 'draft', createdAt: '', updatedAt: '' } as never,
      status: 'draft' as never,
      reply: 'Could you describe the steps you took?',
    });
    render(
      <ToastProvider>
        <QuickCaptureOverlay open onClose={vi.fn()} />
        <Toast />
      </ToastProvider>,
    );
    await send();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/feedback?resume=f9'));
    // Crucially, it must NOT claim the report was filed.
    expect(screen.queryByText(/filed it/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/we hear you/i)).not.toBeInTheDocument();
  });

  it('confirms without navigating when the assistant completes it outright', async () => {
    const push = pushSpy();
    mockStart.mockResolvedValue({
      feedback: { _id: 'f9', status: 'complete', createdAt: '', updatedAt: '' } as never,
      status: 'complete' as never,
      reply: 'Logged it.',
    });
    render(
      <ToastProvider>
        <QuickCaptureOverlay open onClose={vi.fn()} />
        <Toast />
      </ToastProvider>,
    );
    await send();

    expect(await screen.findByText(/filed it/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('says saved-but-unfinished when the assistant is unavailable, never "filed"', async () => {
    pushSpy();
    mockStart.mockRejectedValue(new FeedbackAgentUnavailableError());
    render(
      <ToastProvider>
        <QuickCaptureOverlay open onClose={vi.fn()} />
        <Toast />
      </ToastProvider>,
    );
    await send();

    expect(await screen.findByText(/saved as a draft/i)).toBeInTheDocument();
    expect(screen.queryByText(/filed it/i)).not.toBeInTheDocument();
  });
});
