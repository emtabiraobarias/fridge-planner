import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { usePathname } from 'next/navigation';
import { Nav } from '../../app/nav';

describe('Nav', () => {
  it('marks Inventory as active when on /', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    expect(screen.getByText('Inventory').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Meal Plan').closest('a')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Grocery List').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('marks Meal Plan as active when on /calendar', () => {
    vi.mocked(usePathname).mockReturnValue('/calendar');
    render(<Nav />);
    expect(screen.getByText('Meal Plan').closest('a')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Inventory').closest('a')).not.toHaveAttribute('aria-current');
  });

  it('marks Grocery List as active when on /grocery', () => {
    vi.mocked(usePathname).mockReturnValue('/grocery');
    render(<Nav />);
    expect(screen.getByText('Grocery List').closest('a')).toHaveAttribute('aria-current', 'page');
  });

  it('renders all three nav links', () => {
    vi.mocked(usePathname).mockReturnValue('/');
    render(<Nav />);
    expect(screen.getByText('Inventory')).toBeInTheDocument();
    expect(screen.getByText('Meal Plan')).toBeInTheDocument();
    expect(screen.getByText('Grocery List')).toBeInTheDocument();
  });
});
