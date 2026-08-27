import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Overlay } from '../../../src/components/shared/Overlay';
import { setViewport } from '../../setup';

describe('Overlay (research D5, FR-RS-023, SC-RS-004)', () => {
  it('wires role=dialog, aria-modal and aria-labelledby to titleId', () => {
    render(
      <Overlay open onClose={vi.fn()} titleId="my-title">
        <h2 id="my-title">Title</h2>
        <p>Body</p>
      </Overlay>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'my-title');
  });

  it('renders nothing when closed', () => {
    render(
      <Overlay open={false} onClose={vi.fn()} titleId="my-title">
        <h2 id="my-title">Title</h2>
      </Overlay>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose on scrim click', () => {
    const onClose = vi.fn();
    render(
      <Overlay open onClose={onClose} titleId="my-title">
        <h2 id="my-title">Title</h2>
      </Overlay>,
    );
    // The scrim is the outer presentation-role element (not the dialog panel itself).
    fireEvent.click(screen.getByTestId('overlay-scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Overlay open onClose={onClose} titleId="my-title">
        <h2 id="my-title">Title</h2>
      </Overlay>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking inside the panel', () => {
    const onClose = vi.fn();
    render(
      <Overlay open onClose={onClose} titleId="my-title">
        <h2 id="my-title">Title</h2>
        <button>Inside</button>
      </Overlay>,
    );
    fireEvent.click(screen.getByText('Inside'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('carries both sheet and dialog presentation classes at once — CSS-only, never JS-branched on the viewport hook', () => {
    // The spec's orientation-change edge case requires losing neither state nor
    // trapped focus when a device rotates mid-overlay. A JS-driven swap
    // (`vp === 'desktop' ? <Dialog/> : <Sheet/>`) would remount and lose both;
    // this asserts the alternative — one static class list carrying both the
    // touch (unprefixed) and desktop (`dlg:`) rules, so the browser's own media
    // query evaluation does the swapping, never React.
    //
    // `dlg:` is `(min-width: 1024px) and (pointer: fine)`, not the `xl:` this used to check.
    // Width alone could not tell a laptop from an iPad, so a 1024–1279px desktop window got a
    // bottom sheet pinned across the whole screen.
    render(
      <Overlay open onClose={vi.fn()} titleId="my-title">
        <h2 id="my-title">Title</h2>
        <input aria-label="preserve-me" defaultValue="kept" />
      </Overlay>,
    );
    const dialog = screen.getByRole('dialog');
    const scrim = screen.getByTestId('overlay-scrim');
    // Touch: bottom sheet — flex-end alignment, top rounding, grab handle.
    expect(scrim.className).toContain('items-end');
    expect(dialog.className).toContain('rounded-t-[30px]');
    expect(screen.getByTestId('overlay-grab-handle')).toBeInTheDocument();
    // Desktop overrides present in the SAME class string, not a different tree.
    expect(scrim.className).toContain('dlg:items-center');
    // justify-ITEMS places the panel in its track; justify-content would only move tracks,
    // and the single track already fills the scrim — which left the panel against the edge.
    expect(scrim.className).toContain('dlg:justify-items-center');
    expect(dialog.className).toContain('dlg:rounded-[28px]');

    // A viewport change (e.g. rotation) never remounts the panel: state survives.
    const input = screen.getByLabelText('preserve-me') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'changed' } });
    setViewport('phone-landscape');
    expect((screen.getByLabelText('preserve-me') as HTMLInputElement).value).toBe('changed');
    expect(screen.getByRole('dialog')).toBe(dialog);
  });
});
