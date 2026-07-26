import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Toast } from '../../../src/components/shared/Toast';
import { ToastProvider, useToast } from '../../../src/context/ToastContext';

function Trigger({ message }: { message: string }): React.JSX.Element {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message)}>
      fire
    </button>
  );
}

describe('Toast (design §6, FR-RS-025)', () => {
  it('renders top-centre while keeping its aria-live announcement', async () => {
    render(
      <ToastProvider>
        <Trigger message="Added Chicken to fridge" />
        <Toast />
      </ToastProvider>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'fire' }));

    const toast = screen.getByRole('status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveTextContent('Added Chicken to fridge');
    // design §6 — top-centre, not the shipped bottom-above-the-pill position.
    expect(toast.className).toContain('top-[22px]');
    expect(toast.className).not.toContain('bottom-[84px]');
  });
});
