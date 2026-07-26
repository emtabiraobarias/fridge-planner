'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Home,
  Refrigerator,
  Calendar,
  ShoppingCart,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useInventoryOptional } from '../src/context/InventoryContext';
import { daysLeft, isUrgent } from '../src/lib/quick-parse';
import { useViewportClass } from '../src/hooks/useViewportClass';
import type { ViewportClass } from '../src/lib/viewport';

/**
 * One nav, three positional modes (spec 010 — design §2.1/§2.2, research D3):
 *   pill    — floating, bottom-centre, portrait touch;
 *   rail    — floating, left-docked, vertically centred, landscape touch;
 *   sidebar — in flow, 250px (76px collapsed), desktop.
 *
 * The geometry is pure CSS on one element tree, so rotating a device cannot
 * remount anything. `useViewportClass()` supplies only the non-visual
 * `data-nav-mode` attribute, which is what makes the mode assertable in a unit
 * test where no stylesheet is applied.
 */

interface Tab {
  href: string;
  label: string;
  Icon: LucideIcon;
}

// Labels per design §2.1 (spec 010 supersedes 004's FR-UI-009 labels); every href
// is an existing route. RS1 shipped without the Home tab (the `/home` route did
// not exist yet, and a tab pointing at a dead route would have been worse than
// omitting it); RS5 builds `/home` and restores the tab here (FR-RS-020/022).
const TABS: readonly Tab[] = [
  { href: '/home', label: 'Home', Icon: Home },
  { href: '/', label: 'Fridge', Icon: Refrigerator },
  { href: '/calendar', label: 'Plan', Icon: Calendar },
  { href: '/grocery', label: 'List', Icon: ShoppingCart },
];

const COLLAPSE_KEY = 'fp:nav:collapsed';

type NavMode = 'pill' | 'rail' | 'sidebar';

/** pill (base) → rail (`lg:`) → sidebar (`xl:`) → rail (`phland:`), in cascade order. */
const CONTAINER_CLASS = [
  'fixed bottom-[26px] left-1/2 z-40 flex -translate-x-1/2 flex-row items-center gap-[3px]',
  'rounded-full bg-neutral-900 p-[6px] shadow-lg',
  // rail — iPad landscape
  'lg:bottom-auto lg:left-[22px] lg:top-1/2 lg:translate-x-0 lg:-translate-y-1/2 lg:flex-col lg:gap-1 lg:p-2',
  // sidebar — desktop, in flow
  'xl:static xl:inset-auto xl:h-full xl:shrink-0 xl:translate-x-0 xl:translate-y-0 xl:flex-col',
  'xl:items-stretch xl:justify-start xl:gap-[6px] xl:rounded-none xl:border-r xl:border-divider',
  'xl:bg-surface xl:px-4 xl:py-[26px] xl:shadow-none',
  // rail — phone landscape. `phland:` is declared LAST in tailwind.config.ts, so
  // it is written last here too for the source to read in cascade order.
  'phland:bottom-auto phland:left-[22px] phland:top-1/2 phland:translate-x-0 phland:-translate-y-1/2 phland:flex-col phland:gap-1 phland:p-2',
].join(' ');

const ITEM_CLASS = [
  // ≥44px in both dimensions at every viewport class (FR-RS-025, SC-RS-003).
  'flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-[2px]',
  'rounded-full px-[15px] py-2 text-[10px] font-bold transition-colors',
  // sidebar items are icon-beside-label rows at 14px (design §2.2)
  'xl:flex-row xl:justify-start xl:gap-[11px] xl:py-3 xl:text-sm',
].join(' ');

function modeFor(viewportClass: ViewportClass): NavMode {
  if (viewportClass === 'desktop') return 'sidebar';
  if (viewportClass === 'phone-landscape' || viewportClass === 'ipad-landscape') return 'rail';
  return 'pill';
}

function isActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === 'true';
  } catch {
    // Storage unavailable (e.g. Safari private mode); the preference is cosmetic.
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? 'true' : 'false');
  } catch {
    return;
  }
}

function itemClass(active: boolean, collapsed: boolean): string {
  const tint = active
    ? 'bg-accent text-bg'
    : 'text-neutral-300 hover:bg-neutral-800 hover:text-bg xl:text-ink xl:hover:bg-accent-100';
  // Collapsed sidebar items centre their icon and drop the inline padding.
  return `${ITEM_CLASS} ${tint} ${collapsed ? 'xl:justify-center xl:px-0' : ''}`;
}

/**
 * Brand row — sidebar only (`hidden xl:flex`). The global header in
 * `app/layout.tsx` is `xl:hidden`, so the wordmark appears exactly once per
 * screen (research D2).
 */
function NavBrand({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <div
      className={`hidden xl:mb-2 xl:flex xl:items-center ${
        collapsed ? 'xl:flex-col xl:gap-2' : 'xl:flex-row xl:gap-3'
      }`}
    >
      <span
        aria-hidden
        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-accent text-bg"
      >
        <Refrigerator size={20} strokeWidth={2.75} />
      </span>
      {!collapsed && (
        <span className="truncate font-heading text-[19px] text-ink">Fridge Planner</span>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-label="Toggle navigation"
        aria-expanded={!collapsed}
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink transition-colors hover:bg-accent-100 ${
          collapsed ? '' : 'ml-auto'
        }`}
      >
        {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      </button>
    </div>
  );
}

function NavItem({
  href,
  label,
  Icon,
  active,
  collapsed,
  badge,
}: Tab & { active: boolean; collapsed: boolean; badge: number }): React.JSX.Element {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      {...(collapsed ? { title: label } : {})}
      className={itemClass(active, collapsed)}
    >
      <Icon size={20} strokeWidth={2.75} aria-hidden className="shrink-0" />
      <span className={collapsed ? 'xl:hidden' : ''}>{label}</span>
      {badge > 0 && (
        <span
          data-testid="kitchen-badge"
          className={`inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold ${
            collapsed ? '' : 'xl:ml-auto'
          } ${active ? 'bg-bg text-accent-700' : 'bg-accent text-bg'}`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Nav(): React.JSX.Element {
  const pathname = usePathname();
  const inventory = useInventoryOptional();
  const mode = modeFor(useViewportClass());
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  const urgentCount = inventory
    ? inventory.items.filter((i) => isUrgent(daysLeft(i.expiresAt))).length
    : 0;

  useEffect(() => {
    // Applied in a mount effect rather than a lazy `useState` initialiser: the
    // sidebar's width is rendered output, so a lazy read would be a genuine
    // hydration mismatch on every collapsed-preference load (research D3).
    setCollapsed(readCollapsed());
    // Enable the width transition only from the next frame, so the stored
    // preference lands without visibly animating closed (SC-RS-009).
    const frame = requestAnimationFrame((): void => setReady(true));
    return (): void => cancelAnimationFrame(frame);
  }, []);

  const toggle = (): void => {
    const next = !collapsed;
    setCollapsed(next);
    writeCollapsed(next);
  };

  const transition = ready
    ? 'xl:transition-[width] xl:duration-200 xl:ease-out motion-reduce:transition-none'
    : '';

  return (
    <nav
      aria-label="Main navigation"
      data-nav-mode={mode}
      data-collapsed={collapsed ? 'true' : 'false'}
      {...(ready ? { 'data-nav-ready': 'true' } : {})}
      className={`${CONTAINER_CLASS} ${collapsed ? 'xl:w-[76px]' : 'xl:w-[250px]'} ${transition}`}
    >
      <NavBrand collapsed={collapsed} onToggle={toggle} />

      {TABS.map((tab) => (
        <NavItem
          key={tab.href}
          {...tab}
          active={isActive(tab.href, pathname)}
          collapsed={collapsed}
          badge={tab.href === '/' ? urgentCount : 0}
        />
      ))}

      {/* Secondary entry so the full /feedback surface stays reachable now that it
          is no longer a primary tab (research D11). Sidebar only — the pill and
          rail reach it through the feedback affordance. */}
      <div className="hidden xl:mt-auto xl:block">
        <NavItem
          href="/feedback"
          label="Feedback"
          Icon={MessageCircle}
          active={isActive('/feedback', pathname)}
          collapsed={collapsed}
          badge={0}
        />
      </div>
    </nav>
  );
}
