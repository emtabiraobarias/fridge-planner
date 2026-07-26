import type { Metadata } from 'next';
import { GroceryListProvider } from '../../src/context/GroceryListContext';

export const metadata: Metadata = { title: 'Home' };
import { HomePage } from '../../src/views/HomePage';

/**
 * `/home` — net-new Home dashboard route (spec 010 US5, research D6). `/`
 * keeps rendering the Kitchen unchanged (FR-RS-026 — no route renamed).
 * `GroceryListProvider` is mounted here only, mirroring `app/grocery/page.tsx`
 * — NOT hoisted to `app/providers.tsx` — so the Kitchen and Calendar screens
 * gain no request they don't already make.
 */
export default function HomeRoute(): React.JSX.Element {
  return (
    <GroceryListProvider>
      <HomePage />
    </GroceryListProvider>
  );
}
