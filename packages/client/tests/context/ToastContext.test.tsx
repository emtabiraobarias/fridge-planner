import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ToastProvider, useToast } from '../../src/context/ToastContext';
import { Toast } from '../../src/components/shared/Toast';

/** Harness exposing the context to the test via buttons. */
function Harness({ onAction }: { onAction: () => void }): React.JSX.Element {
  const { showToast } = useToast();
  return (
    <div>
      <button type="button" onClick={() => showToast('Item added')}>
        show message-only
      </button>
      <button type="button" onClick={() => showToast('Milk merged', { label: 'Undo', onAction })}>
        show with action
      </button>
    </div>
  );
}

function renderHarness(onAction: () => void): void {
  render(
    <ToastProvider>
      <Harness onAction={onAction} />
      <Toast />
    </ToastProvider>,
  );
}

describe('ToastContext (spec 009 research D7 — optional action)', () => {
  it('existing message-only showToast(message) still shows the message and auto-dismisses (regression)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    renderHarness(vi.fn());

    await user.click(screen.getByRole('button', { name: /show message-only/i }));
    expect(await screen.findByText('Item added')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    await waitFor(() => expect(screen.queryByText('Item added')).not.toBeInTheDocument());

    vi.useRealTimers();
  });

  it('showToast(message, { label, onAction }) renders a focusable, keyboard-operable action control that invokes onAction', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderHarness(onAction);

    await user.click(screen.getByRole('button', { name: /show with action/i }));
    expect(await screen.findByText('Milk merged')).toBeInTheDocument();

    const actionButton = screen.getByRole('button', { name: /undo/i });
    expect(actionButton).toBeInTheDocument();

    actionButton.focus();
    expect(actionButton).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('activating the action dismisses the toast', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderHarness(onAction);

    await user.click(screen.getByRole('button', { name: /show with action/i }));
    const actionButton = await screen.findByRole('button', { name: /undo/i });

    await user.click(actionButton);
    expect(onAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Milk merged')).not.toBeInTheDocument());
  });
});
