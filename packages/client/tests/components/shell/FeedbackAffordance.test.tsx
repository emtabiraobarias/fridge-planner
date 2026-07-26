import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { FeedbackAffordance } from '../../../src/components/shell/FeedbackAffordance';

describe('FeedbackAffordance (FR-RS-006)', () => {
  it('is a labelled control reachable from every screen', () => {
    render(<FeedbackAffordance />);
    expect(screen.getByRole('button', { name: /tell us/i })).toBeInTheDocument();
  });

  it('opens QuickCaptureOverlay on tap, which reaches the full /feedback surface via its own link (RS6 T058, research D11)', async () => {
    render(<FeedbackAffordance />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /tell us/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open full feedback/i })).toHaveAttribute('href', '/feedback');
  });

  it('renders a round bubble at the touch viewport classes', () => {
    render(<FeedbackAffordance />);
    const cls = screen.getByRole('button', { name: /tell us/i }).className;
    expect(cls).toContain('rounded-full');
    // design §2.3 — 56×56 at phone portrait, 54×54 phone landscape, 60×60 iPad
    expect(cls).toContain('h-14');
    expect(cls).toContain('w-14');
    expect(cls).toContain('phland:h-[54px]');
    expect(cls).toContain('sm:h-[60px]');
    expect(cls).toContain('lg:h-[60px]');
  });

  it('becomes a labelled `Tell us` pill at desktop only', () => {
    render(<FeedbackAffordance />);
    const cls = screen.getByRole('button', { name: /tell us/i }).className;
    expect(cls).toContain('xl:h-[54px]');
    expect(cls).toContain('xl:w-auto');
    expect(cls).toContain('xl:px-[22px]');
    const label = screen.getByText('Tell us');
    expect(label.className).toContain('hidden');
    expect(label.className).toContain('xl:inline');
  });

  it('is fixed clear of the nav at every viewport class', () => {
    render(<FeedbackAffordance />);
    const cls = screen.getByRole('button', { name: /tell us/i }).className;
    expect(cls).toContain('fixed');
    // Bottom offsets clear the pill (portrait) and the rail is on the left, so
    // the affordance never obscures navigation (design §2.3).
    expect(cls).toContain('bottom-24'); // 96px — above the 26px pill
    expect(cls).toContain('right-4');
    expect(cls).toContain('phland:bottom-5');
    expect(cls).toContain('sm:bottom-[100px]');
    expect(cls).toContain('lg:bottom-6');
    expect(cls).toContain('xl:bottom-8');
    expect(cls).toContain('xl:right-8');
  });
});
