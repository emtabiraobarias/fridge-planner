/**
 * The five viewport classes of spec 010 (design/responsive-system.md §1.1).
 *
 * Single source of truth for three consumers that must never drift (research D1):
 *   1. `tailwind.config.ts` → `extend.screens.phland` (the one class no stock
 *      breakpoint can express — it is width *and* orientation *and* height bound);
 *   2. `useViewportClass()` (`src/hooks/useViewportClass.ts`);
 *   3. the named Playwright viewport projects (`playwright.config.ts`).
 */
export type ViewportClass =
  | 'phone'
  | 'phone-landscape'
  | 'ipad-portrait'
  | 'ipad-landscape'
  | 'desktop';

/**
 * The `phland` raw query. Declared LAST in `extend.screens` so it beats `sm:` at
 * equal specificity on a 844×390 phone in landscape (research D1 — the Playwright
 * `padding-left: 96px` check at 844×390 is the assertion that proves the ordering).
 */
export const PHONE_LANDSCAPE_QUERY =
  '(max-width: 899px) and (orientation: landscape) and (max-height: 500px)';

export const VIEWPORT_QUERIES: Record<ViewportClass, string> = {
  phone: '(max-width: 639px)',
  'phone-landscape': PHONE_LANDSCAPE_QUERY,
  'ipad-portrait': '(min-width: 640px) and (max-width: 1023px)',
  'ipad-landscape': '(min-width: 1024px) and (max-width: 1279px)',
  desktop: '(min-width: 1280px)',
};

/**
 * Resolution order mirrors the Tailwind cascade: `phland` is declared last and so
 * wins over `sm:`, which means `phone-landscape` must be tested first for the CSS
 * and the hook to agree at every size (a 844×390 viewport satisfies both).
 */
const PRECEDENCE: readonly ViewportClass[] = [
  'phone-landscape',
  'desktop',
  'ipad-landscape',
  'ipad-portrait',
  'phone',
];

/** The SSR/first-render default; matches the Playwright `desktop` project (1280×720). */
export const DEFAULT_VIEWPORT_CLASS: ViewportClass = 'desktop';

/** Framework-free resolver so both the hook and its test stub share one rule set. */
export function resolveViewportClass(matches: (query: string) => boolean): ViewportClass {
  for (const cls of PRECEDENCE) {
    if (matches(VIEWPORT_QUERIES[cls])) return cls;
  }
  return DEFAULT_VIEWPORT_CLASS;
}
