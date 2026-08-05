'use client';
import { useEffect, useState } from 'react';
import { fetchMe, type Me } from '../services/admin';

/**
 * The signed-in identity and whether it may administer (spec 002 FR-D-012).
 *
 * Returns `null` while unknown, so callers render nothing rather than flashing the
 * wrong identity — or an Admin badge at an ordinary user — before the answer arrives.
 *
 * Reuses spec 011's `GET /api/v1/me`; no new endpoint is introduced (plan D-S3).
 */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((m) => {
        if (!cancelled) setMe(m);
      })
      .catch(() => {
        // Unauthenticated or offline — no identity to show. The server remains the
        // authority for every capability either way.
        if (!cancelled) setMe(null);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  return me;
}
