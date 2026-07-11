'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Inventory' },
  { href: '/calendar', label: 'Meal Plan' },
  { href: '/grocery', label: 'Grocery List' },
  { href: '/feedback', label: 'Feedback' },
] as const;

export function Nav(): React.JSX.Element {
  const pathname = usePathname();

  function linkClass(href: string): string {
    const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;
  }

  return (
    <nav className="flex gap-1" aria-label="Main navigation">
      {NAV_LINKS.map(({ href, label }) => {
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={linkClass(href)}
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
