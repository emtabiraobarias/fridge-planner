'use client';
import { useEffect, useState } from 'react';
import { fetchMe } from '../services/admin';

/**
 * Whether the signed-in user may administer (spec 011, research D11).
 *
 * Returns `null` while unknown, so callers can render *nothing* rather than briefly
 * flashing an admin control at an ordinary user (or briefly hiding it from a real
 * administrator) before the answer arrives.
 *
 * ⚠️ This is a **UI convenience only**. Hiding a control is never the enforcement —
 * every admin capability is guarded on its own route server-side (FR-AD-002), and a
 * non-admin who navigates straight to `/admin` gets refused by the API, not by this
 * hook. Do not add a security assumption on top of it.
 */
export function useIsAdmin(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((me) => {
        if (!cancelled) setIsAdmin(me.isAdmin);
      })
      .catch(() => {
        // Unauthenticated or offline — treat as "not an administrator". The server is
        // the authority either way, so failing closed here costs nothing.
        if (!cancelled) setIsAdmin(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  return isAdmin;
}
