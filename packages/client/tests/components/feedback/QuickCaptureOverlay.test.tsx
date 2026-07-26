import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickCaptureOverlay } from '../../../src/components/feedback/QuickCaptureOverlay';
import { ToastProvider } from '../../../src/context/ToastContext';

vi.mock('../../../src/services/feedback', () => ({
  startFeedback: vi.fn(),
}));

import { startFeedback } from '../../../src/services/feedback';

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
    expect(screen.getByRole('link', { name: /open full feedback/i })).toHaveAttribute('href', '/feedback');
  });

  it('disables Send it until there is text', () => {
    render(<QuickCaptureOverlay open onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /send it/i })).toBeDisabled();
  });
});
