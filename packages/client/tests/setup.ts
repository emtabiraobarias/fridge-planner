import '@testing-library/jest-dom';
import { createElement } from 'react';
import { vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'aria-current': ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    'aria-current'?: string;
  }): React.ReactElement =>
    createElement('a', { href, className, 'aria-current': ariaCurrent }, children),
}));
