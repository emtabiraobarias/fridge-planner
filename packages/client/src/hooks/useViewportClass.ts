'use client';
import { useEffect, useState } from 'react';
import {
  DEFAULT_VIEWPORT_CLASS,
  VIEWPORT_QUERIES,
  resolveViewportClass,
  type ViewportClass,
} from '../lib/viewport';

/**
 * The current viewport class, driven by `window.matchMedia` (research D4).
 *
 * Hydration-safe by construction: state starts at `DEFAULT_VIEWPORT_CLASS`
 * ('desktop' — exactly what the server renders), and the real class is applied in
 * a mount effect. No `useSyncExternalStore` snapshot divergence, no
 * `suppressHydrationWarning`. Layout that can be expressed in CSS should be
 * expressed in CSS (see `AppShell`); this hook is for the cases where the *tree*
 * differs, not just the styling.
 */
export function useViewportClass(): ViewportClass {
  const [viewportClass, setViewportClass] = useState<ViewportClass>(DEFAULT_VIEWPORT_CLASS);

  useEffect(() => {
    const lists = new Map(
      Object.values(VIEWPORT_QUERIES).map((query) => [query, window.matchMedia(query)] as const),
    );
    const sync = (): void => {
      setViewportClass(resolveViewportClass((query) => lists.get(query)?.matches ?? false));
    };
    sync();
    for (const list of lists.values()) list.addEventListener('change', sync);
    return (): void => {
      for (const list of lists.values()) list.removeEventListener('change', sync);
    };
  }, []);

  return viewportClass;
}
