import { act, renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useViewportClass } from '../../src/hooks/useViewportClass';
import { resolveViewportClass, VIEWPORT_QUERIES } from '../../src/lib/viewport';
import { setViewport } from '../setup';

describe('useViewportClass (FR-RS-001)', () => {
  it('starts at the server-rendered default so there is no hydration mismatch', () => {
    const { result } = renderHook(() => useViewportClass());
    // The stub defaults to 'desktop', which is also the hook's initial state —
    // first paint and first client render agree by construction (research D4).
    expect(result.current).toBe('desktop');
  });

  it('reports the matching class after mount and on a matchMedia change event', () => {
    const { result } = renderHook(() => useViewportClass());

    act(() => setViewport('phone'));
    expect(result.current).toBe('phone');

    act(() => setViewport('ipad-landscape'));
    expect(result.current).toBe('ipad-landscape');

    act(() => setViewport('desktop'));
    expect(result.current).toBe('desktop');
  });

  it('resolves phone landscape ahead of the wider classes it also matches', () => {
    // 844×390 satisfies both `phland` and `sm:`; the resolver mirrors Tailwind's
    // declaration order, where `phland` is last and therefore wins (research D1).
    const at844x390 = (query: string): boolean =>
      query === VIEWPORT_QUERIES['phone-landscape'] || query === VIEWPORT_QUERIES['ipad-portrait'];
    expect(resolveViewportClass(at844x390)).toBe('phone-landscape');
  });

  it('unsubscribes on unmount', () => {
    const { result, unmount } = renderHook(() => useViewportClass());
    act(() => setViewport('phone'));
    expect(result.current).toBe('phone');
    unmount();
    // No listener remains, so this must not throw an update-after-unmount warning.
    act(() => setViewport('ipad-portrait'));
  });
});
