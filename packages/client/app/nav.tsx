'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Refrigerator, Calendar, ShoppingCart, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useInventoryOptional } from '../src/context/InventoryContext';
import { daysLeft, isUrgent } from '../src/lib/quick-parse';

interface Tab {
  href: string;
  label: string;
  Icon: LucideIcon;
}

const TABS: readonly Tab[] = [
  { href: '/', label: 'Kitchen', Icon: Refrigerator },
  { href: '/calendar', label: 'Meal plan', Icon: Calendar },
  { href: '/grocery', label: 'Groceries', Icon: ShoppingCart },
  { href: '/feedback', label: 'Feedback', Icon: MessageCircle },
];

function isActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function Nav(): React.JSX.Element {
  const pathname = usePathname();
  const inventory = useInventoryOptional();
  const urgentCount = inventory
    ? inventory.items.filter((i) => isUrgent(daysLeft(i.expiresAt))).length
    : 0;

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-[18px] left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full bg-neutral-900 p-[7px] shadow-lg"
    >
      {TABS.map(({ href, label, Icon }) => {
        const active = isActive(href, pathname);
        const showBadge = href === '/' && urgentCount > 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-[7px] rounded-full px-[18px] py-[10px] text-[13px] font-semibold transition-colors ${
              active
                ? 'bg-accent text-bg'
                : 'text-neutral-300 hover:bg-white/[0.12] hover:text-white'
            }`}
          >
            <Icon size={16} strokeWidth={2.75} aria-hidden />
            <span>{label}</span>
            {showBadge && (
              <span
                data-testid="kitchen-badge"
                className={`ml-1 inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold ${
                  active ? 'bg-bg text-accent-700' : 'bg-accent text-bg'
                }`}
              >
                {urgentCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
