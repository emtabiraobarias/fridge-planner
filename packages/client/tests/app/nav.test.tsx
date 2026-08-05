import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { usePathname } from 'next/navigation';
import { Nav } from '../../app/nav';
import { setViewport } from '../setup';

function nav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Main navigation' });
}

describe('Nav — labels and routes (FR-RS-002/026)', () => {
  it('renders the four spec-010 labels (supersedes 004 FR-UI-009)', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    // Home ('/home') is restored now that RS5 builds the route (FR-RS-020/022).
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Home').closest('a')).toHaveAttribute('href', '/home');
    expect(screen.getByText('Fridge')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('List')).toBeInTheDocument();
  });

  it('marks the fridge tab active with aria-current on /', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    expect(screen.getByText('Fridge').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Plan').closest('a')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('List').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('marks Plan active on /calendar', () => {
    vi.mocked(usePathname).mockReturnValue('/calendar');
    render(<Nav />);
    expect(screen.getByText('Plan').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Fridge').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('marks List active on /grocery', () => {
    vi.mocked(usePathname).mockReturnValue('/grocery');
    render(<Nav />);
    expect(screen.getByText('List').closest('a')).toHaveAttribute('aria-current', 'page');
  });

  it('points each tab at its unchanged route (FR-RS-026 — no route renamed)', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    expect(screen.getByText('Fridge').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('Plan').closest('a')).toHaveAttribute('href', '/calendar');
    expect(screen.getByText('List').closest('a')).toHaveAttribute('href', '/grocery');
  });

  it('does not duplicate the feedback affordance in the desktop sidebar — the Tell us pill is the single control per viewport (T061a)', () => {
    // RS1 shipped a secondary sidebar `Feedback` NavItem alongside the
    // floating/pill FeedbackAffordance (research D11), so desktop showed both
    // at once — a user-reported nit. Design §3 specifies exactly one feedback
    // affordance per viewport; the pill now reaches `/feedback` transitively
    // via QuickCaptureOverlay's "Open full feedback" link (see
    // FeedbackAffordance.test.tsx), so the sidebar no longer needs its own
    // entry — Nav renders only the four primary tabs.
    setViewport('desktop');
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    expect(screen.queryByText('Feedback')).not.toBeInTheDocument();
  });

  it('renders without a badge when there is no inventory provider', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    // No urgent-count badge when inventory context is absent.
    expect(screen.queryByTestId('kitchen-badge')).not.toBeInTheDocument();
  });
});

describe('Nav — three positional modes (FR-RS-002)', () => {
  it('is a bottom-centre pill at phone portrait', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    act(() => setViewport('phone'));
    expect(nav()).toHaveAttribute('data-nav-mode', 'pill');
    expect(nav().className).toContain('fixed');
    expect(nav().className).toContain('bottom-[26px]');
    expect(nav().className).toContain('left-1/2');
    expect(nav().className).toContain('-translate-x-1/2');
    expect(nav().className).toContain('rounded-full');
  });

  it('gives every pill item a 44px touch target (FR-RS-025, SC-RS-003)', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    const item = screen.getByText('Fridge').closest('a');
    expect(item?.className).toContain('min-h-[44px]');
    expect(item?.className).toContain('min-w-[44px]');
  });

  it('is a pill at iPad portrait too', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    act(() => setViewport('ipad-portrait'));
    expect(nav()).toHaveAttribute('data-nav-mode', 'pill');
  });

  it('is a left-docked vertical rail in landscape (both phone and iPad)', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    act(() => setViewport('phone-landscape'));
    expect(nav()).toHaveAttribute('data-nav-mode', 'rail');
    act(() => setViewport('ipad-landscape'));
    expect(nav()).toHaveAttribute('data-nav-mode', 'rail');
    // The rail geometry is CSS, duplicated across both landscape conditions
    // (`phland` cannot be expressed as a min-width breakpoint — research D1).
    const cls = nav().className;
    expect(cls).toContain('phland:left-[22px]');
    expect(cls).toContain('phland:flex-col');
    expect(cls).toContain('lg:left-[22px]');
    expect(cls).toContain('lg:flex-col');
  });

  it('is an in-flow sidebar at desktop', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    act(() => setViewport('desktop'));
    expect(nav()).toHaveAttribute('data-nav-mode', 'sidebar');
    const cls = nav().className;
    expect(cls).toContain('xl:static');
    expect(cls).toContain('xl:w-[250px]');
    expect(cls).toContain('xl:flex-col');
    expect(cls).toContain('xl:border-r');
  });
});

describe('Nav — sidebar collapse persistence (FR-RS-003, SC-RS-009)', () => {
  it('starts expanded, collapses on toggle and writes the preference', async () => {
    setViewport('desktop');
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);

    expect(nav().className).toContain('xl:w-[250px]');
    expect(nav()).toHaveAttribute('data-collapsed', 'false');

    await userEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));

    expect(nav()).toHaveAttribute('data-collapsed', 'true');
    expect(nav().className).toContain('xl:w-[76px]');
    expect(window.localStorage.getItem('fp:nav:collapsed')).toBe('true');
  });

  it('reads the stored preference on mount and renders already-narrow', () => {
    window.localStorage.setItem('fp:nav:collapsed', 'true');
    setViewport('desktop');
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);

    expect(nav()).toHaveAttribute('data-collapsed', 'true');
    expect(nav().className).toContain('xl:w-[76px]');
    // Collapsed items keep a native tooltip since their labels are hidden.
    expect(screen.getByText('Fridge').closest('a')).toHaveAttribute('title', 'Fridge');
  });

  it('gates the width transition behind data-nav-ready so it does not animate closed on load', async () => {
    window.localStorage.setItem('fp:nav:collapsed', 'true');
    setViewport('desktop');
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);

    // The stored preference is applied in the mount commit, while the transition
    // is only enabled a frame later — so a returning user's sidebar renders
    // already-narrow instead of animating closed (D3, SC-RS-009).
    expect(nav()).toHaveAttribute('data-collapsed', 'true');
    expect(nav()).not.toHaveAttribute('data-nav-ready');
    expect(nav().className).not.toContain('xl:transition-[width]');

    await waitFor(() => expect(nav()).toHaveAttribute('data-nav-ready', 'true'));
    expect(nav().className).toContain('xl:transition-[width]');
  });

  it('shows the expand affordance when collapsed and the collapse affordance when expanded', async () => {
    setViewport('desktop');
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    const toggle = screen.getByRole('button', { name: 'Toggle navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Fridge Planner')).not.toBeInTheDocument();
  });

  it('renders the full wordmark, not truncated, in the expanded sidebar (T061b)', () => {
    // `truncate` used to clip the 250px expanded sidebar's wordmark to
    // "Fridge Pl…"; it now wraps instead, so the full string is present.
    setViewport('desktop');
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    const wordmark = screen.getByText('Fridge Planner');
    expect(wordmark).toBeInTheDocument();
    expect(wordmark.className).not.toContain('truncate');
  });
});

// T110 — spec 002 FR-D-017: the account controls must NOT become a fifth primary
// navigation destination. That layout is tuned for four items across five viewport
// classes (spec 010 FR-RS-002) and has already shipped clipping defects under exactly
// this pressure, so this is a constraint with a guard, not a style preference.
describe('primary navigation stays four destinations (FR-D-017)', () => {
  it('renders exactly Home / Fridge / Plan / List — the account panel is not among them', () => {
    render(<Nav />);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent?.trim());

    expect(labels).toEqual(['Home', 'Fridge', 'Plan', 'List']);
    expect(within(nav).queryByRole('link', { name: /account|sign/i })).not.toBeInTheDocument();
  });
});
