import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AppShell } from '../../../src/components/shell/AppShell';

describe('AppShell (FR-RS-004/005, SC-RS-001/002)', () => {
  it('fills the viewport and cannot itself scroll', () => {
    const { container } = render(<AppShell>content</AppShell>);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    // 100dvh, not 100vh: mobile browser chrome makes 100vh taller than the
    // visible area, which would push the nav below the fold.
    expect(root?.className).toContain('h-dvh');
    expect(root?.className).toContain('flex');
    expect(root?.className).toContain('flex-col');
    expect(root?.className).toContain('overflow-hidden');
  });

  it('makes the content region the only scroll container', () => {
    const { container } = render(<AppShell>content</AppShell>);
    const main = screen.getByRole('main');
    expect(main.className).toContain('flex-1');
    expect(main.className).toContain('min-h-0');
    expect(main.className).toContain('overflow-auto');

    const scrollers = container.querySelectorAll('[class*="overflow-auto"], [class*="overflow-y-auto"]');
    expect(scrollers).toHaveLength(1);
    expect(scrollers[0]).toBe(main);
  });

  it('keeps the nav and the feedback affordance outside the scroll container', () => {
    render(<AppShell>content</AppShell>);
    const main = screen.getByRole('main');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const affordance = screen.getByRole('button', { name: /tell us/i });
    expect(main.contains(nav)).toBe(false);
    expect(main.contains(affordance)).toBe(false);
    expect(nav.parentElement).toBe(main.parentElement);
    expect(affordance.parentElement).toBe(main.parentElement);
  });

  it('wraps children in exactly one border-box padded wrapper', () => {
    render(
      <AppShell>
        <p>child</p>
      </AppShell>,
    );
    const wrapper = screen.getByText('child').parentElement;
    expect(wrapper?.className).toContain('box-border');
    // Without border-box the §1.3 padding adds to a width:100% box and overflows
    // horizontally — the thing SC-RS-001 measures.
    expect(screen.getByRole('main').children).toHaveLength(1);
  });

  it('carries the per-viewport padding and the desktop content cap on that wrapper', () => {
    render(
      <AppShell>
        <p>child</p>
      </AppShell>,
    );
    const cls = screen.getByText('child').parentElement?.className ?? '';
    // design §1.3 — phone portrait 54/16/116
    expect(cls).toContain('pt-[54px]');
    expect(cls).toContain('px-4');
    expect(cls).toContain('pb-[116px]');
    // phone landscape 30 / left 96 (clears the rail) / right 16 / 44
    expect(cls).toContain('phland:pt-[30px]');
    expect(cls).toContain('phland:pl-24');
    expect(cls).toContain('phland:pb-11');
    // iPad portrait 40/34/116
    expect(cls).toContain('sm:pt-10');
    expect(cls).toContain('sm:px-[34px]');
    // iPad landscape 40 / left 120 / right 34 / 44
    expect(cls).toContain('lg:pl-[120px]');
    expect(cls).toContain('lg:pr-[34px]');
    expect(cls).toContain('lg:pb-11');
    // desktop 32/40/48 + 1120px centred cap
    expect(cls).toContain('xl:pt-8');
    expect(cls).toContain('xl:px-10');
    expect(cls).toContain('xl:pb-12');
    expect(cls).toContain('xl:max-w-content');
    expect(cls).toContain('xl:mx-auto');
  });
});
