'use client';
import { useMe } from './useMe';

/**
 * Whether the signed-in user may administer (spec 011, research D11).
 *
 * Now a thin wrapper over `useMe()` — the identity and the privilege come from the same
 * single `/api/v1/me` call. Kept as its own export so spec 011's callers stay untouched,
 * the same non-breaking-seam reasoning as `authenticate()`/`authenticatePrincipal()`.
 *
 * ⚠️ UI convenience only. Hiding a control is never the enforcement — every admin
 * capability is guarded server-side on its own route (FR-AD-002).
 */
export function useIsAdmin(): boolean | null {
  const me = useMe();
  return me === null ? null : me.isAdmin;
}
