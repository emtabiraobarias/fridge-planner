import '@testing-library/jest-dom';
import { createElement } from 'react';
import { afterEach, vi } from 'vitest';
import {
  DEFAULT_VIEWPORT_CLASS,
  VIEWPORT_QUERIES,
  type ViewportClass,
} from '../src/lib/viewport';

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
  // Forward every prop (className, aria-*, title, …) so components can be
  // asserted on their real attributes rather than a mock's allow-list.
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>): React.ReactElement =>
    createElement('a', { href, ...rest }, children),
}));

/* ------------------------------------------------------------------------- *
 * `window.matchMedia` stub + `setViewport()` (spec 010, research D9)
 *
 * jsdom implements no `matchMedia`, so any suite rendering a `useViewportClass()`
 * consumer (`Nav`, `CalendarPage`, …) would throw `window.matchMedia is not a
 * function`. The stub is driven by one module-level "current viewport class",
 * defaulting to 'desktop' — the same value the hook renders on the server, so the
 * existing suites are unaffected.
 * ------------------------------------------------------------------------- */

type MediaListener = (event: MediaQueryListEvent) => void;

let currentViewport: ViewportClass = DEFAULT_VIEWPORT_CLASS;
const listeners = new Map<string, Set<MediaListener>>();

function queryMatches(query: string): boolean {
  return query === VIEWPORT_QUERIES[currentViewport];
}

function listenersFor(query: string): Set<MediaListener> {
  const existing = listeners.get(query);
  if (existing) return existing;
  const created = new Set<MediaListener>();
  listeners.set(query, created);
  return created;
}

function createMediaQueryList(query: string): MediaQueryList {
  const list = {
    media: query,
    get matches(): boolean {
      return queryMatches(query);
    },
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener): void => {
      listenersFor(query).add(listener);
    },
    removeEventListener: (_type: string, listener: MediaListener): void => {
      listenersFor(query).delete(listener);
    },
    addListener: (listener: MediaListener): void => {
      listenersFor(query).add(listener);
    },
    removeListener: (listener: MediaListener): void => {
      listenersFor(query).delete(listener);
    },
    dispatchEvent: (): boolean => true,
  };
  return list as unknown as MediaQueryList;
}

/**
 * Switch the stubbed viewport class and notify every subscribed media query, so
 * `useViewportClass()` consumers re-render. Call inside `act()` when a component
 * is already mounted; call before `render()` to choose the initial class.
 */
export function setViewport(cls: ViewportClass = DEFAULT_VIEWPORT_CLASS): void {
  currentViewport = cls;
  for (const [query, set] of listeners) {
    const event = { matches: queryMatches(query), media: query } as MediaQueryListEvent;
    for (const listener of set) listener(event);
  }
}

// This setup file also runs for the node-environment suites under tests/server/,
// which have no `window` at all — install the DOM stubs only when there is a DOM.
const hasDom = typeof window !== 'undefined';

if (hasDom) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => createMediaQueryList(query),
  });
}

/* ------------------------------------------------------------------------- *
 * In-memory `localStorage`
 *
 * This jsdom environment exposes `window.localStorage` as a bare object with no
 * `Storage` methods (`getItem` is `undefined`), so the sidebar-collapse
 * preference (FR-RS-003) has nothing to read or write. Install a real
 * Storage-shaped stub, cleared between tests.
 * ------------------------------------------------------------------------- */

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length(): number {
      return entries.size;
    },
    key: (index: number): string | null => [...entries.keys()][index] ?? null,
    getItem: (key: string): string | null => entries.get(key) ?? null,
    setItem: (key: string, value: string): void => void entries.set(key, String(value)),
    removeItem: (key: string): void => void entries.delete(key),
    clear: (): void => entries.clear(),
  };
}

if (hasDom && typeof window.localStorage?.getItem !== 'function') {
  Object.defineProperty(window, 'localStorage', {
    writable: true,
    configurable: true,
    value: createMemoryStorage(),
  });
}

afterEach(() => {
  currentViewport = DEFAULT_VIEWPORT_CLASS;
  listeners.clear();
  if (hasDom) window.localStorage.clear();
});
