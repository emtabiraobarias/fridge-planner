import { useRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { useFocusTrap } from '../../src/hooks/useFocusTrap';

function Harness({ active }: { active: boolean }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <div ref={ref}>
      <button>First</button>
      <button>Second</button>
    </div>
  );
}

describe('useFocusTrap (research D5/D12, FR-RS-023, SC-RS-004)', () => {
  let opener: HTMLButtonElement;

  afterEach(() => {
    opener.remove();
  });

  it('records the opener, focuses the first tabbable node on activation, cycles Tab/Shift+Tab, and restores focus on deactivation', async () => {
    opener = document.createElement('button');
    opener.textContent = 'Opener';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { rerender } = render(<Harness active={false} />);
    // Inactive: focus is untouched.
    expect(document.activeElement).toBe(opener);

    rerender(<Harness active={true} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('First')));

    const first = screen.getByText('First');
    const second = screen.getByText('Second');

    // Tab forward from the last tabbable node wraps to the first.
    second.focus();
    fireEvent.keyDown(second, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    // Shift+Tab from the first tabbable node wraps to the last.
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(second);

    rerender(<Harness active={false} />);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe('useFocusTrap — does not auto-focus text entry (mobile zoom/keyboard, spec 010)', () => {
  function TrapWithInput(): React.JSX.Element {
    const ref = useRef<HTMLDivElement>(null);
    useFocusTrap(ref, true);
    return (
      <div ref={ref} tabIndex={-1} data-testid="panel">
        <input aria-label="Name" defaultValue="" />
        <button type="button">Save</button>
      </div>
    );
  }

  it('focuses the panel, not the leading text input', async () => {
    // iOS zooms toward a focused sub-16px field and never zooms back out, and the
    // on-screen keyboard springs up unbidden — reported as "modals zoom in the
    // view but fail to zoom out". Focus lands on the panel instead; Tab still
    // reaches the input.
    render(<TrapWithInput />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('panel')));
    expect(document.activeElement).not.toBe(screen.getByLabelText('Name'));
  });
});
