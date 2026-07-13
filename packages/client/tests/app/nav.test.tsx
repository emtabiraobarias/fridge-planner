import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { usePathname } from 'next/navigation';
import { Nav } from '../../app/nav';

describe('Nav (bottom tab bar)', () => {
  it('renders the four renamed tabs', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Meal plan')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Feedback')).toBeInTheDocument();
  });

  it('marks Kitchen active with aria-current on /', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    expect(screen.getByText('Kitchen').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Meal plan').closest('a')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Groceries').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('marks Meal plan active on /calendar', () => {
    vi.mocked(usePathname).mockReturnValue('/calendar');
    render(<Nav />);
    expect(screen.getByText('Meal plan').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Kitchen').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('marks Groceries active on /grocery', () => {
    vi.mocked(usePathname).mockReturnValue('/grocery');
    render(<Nav />);
    expect(screen.getByText('Groceries').closest('a')).toHaveAttribute('aria-current', 'page');
  });

  it('points each tab at its route', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    expect(screen.getByText('Kitchen').closest('a')).toHaveAttribute('href', '/');
    expect(screen.getByText('Meal plan').closest('a')).toHaveAttribute('href', '/calendar');
    expect(screen.getByText('Groceries').closest('a')).toHaveAttribute('href', '/grocery');
    expect(screen.getByText('Feedback').closest('a')).toHaveAttribute('href', '/feedback');
  });

  it('renders without a badge when there is no inventory provider', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    // No urgent-count badge when inventory context is absent.
    expect(screen.queryByTestId('kitchen-badge')).not.toBeInTheDocument();
  });
});
