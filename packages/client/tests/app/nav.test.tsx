import { act, render, screen, waitFor } from '@testing-library/react';
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
    // Home ('/home') is intentionally absent until RS5 builds that route — RS1
    // ships standalone, so the nav never links to a non-existent page.
    expect(screen.queryByText('Home')).not.toBeInTheDocument();
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

  it('keeps /feedback reachable from the desktop sidebar (research D11)', () => {
    setViewport('desktop');
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    expect(screen.getByText('Feedback').closest('a')).toHaveAttribute('href', '/feedback');
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
});
