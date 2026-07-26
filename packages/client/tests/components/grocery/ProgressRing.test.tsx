import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProgressRing } from '../../../src/components/grocery/ProgressRing';

describe('ProgressRing (spec 010 FR-RS-016)', () => {
  it('renders the conic-gradient ring (via .progress-ring, src/index.css) alongside the checked/total figure', () => {
    render(<ProgressRing checked={3} total={6} />);
    const ring = screen.getByRole('progressbar');
    // jsdom's CSS parser doesn't implement `conic-gradient()`, so the gradient
    // itself lives in the `.progress-ring` class (src/index.css) rather than
    // inline; the per-render fill is the `--pct` custom property, which jsdom
    // does preserve. See ProgressRing.tsx's comment for the full rationale.
    expect(ring.className).toContain('progress-ring');
    expect(ring.style.getPropertyValue('--pct')).toBe('50%');
    expect(screen.getByText('3/6')).toBeInTheDocument();
  });

  it('exposes checked/total as accessible progress values, not colour alone', () => {
    render(<ProgressRing checked={3} total={6} />);
    const ring = screen.getByRole('progressbar', { name: /shopping progress/i });
    expect(ring).toHaveAttribute('aria-valuenow', '3');
    expect(ring).toHaveAttribute('aria-valuemin', '0');
    expect(ring).toHaveAttribute('aria-valuemax', '6');
  });

  it('reflects a different purchased.length/items.length pair', () => {
    render(<ProgressRing checked={0} total={4} />);
    expect(screen.getByText('0/4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('does not divide by zero on an empty list', () => {
    render(<ProgressRing checked={0} total={0} />);
    expect(screen.getByText('0/0')).toBeInTheDocument();
    const ring = screen.getByRole('progressbar');
    expect(ring.style.getPropertyValue('--pct')).toBe('0%');
  });
});
