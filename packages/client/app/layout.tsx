import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Caprasimo, Figtree } from 'next/font/google';
import { Refrigerator } from 'lucide-react';
import { Providers } from './providers';
import { AppShell } from '../src/components/shell/AppShell';
import '../src/index.css';

const caprasimo = Caprasimo({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-heading',
});

const figtree = Figtree({
  weight: ['400', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: { default: 'Fridge Planner', template: '%s | Fridge Planner' },
  description: 'AI-powered meal planning and fridge inventory management',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en" className={`${caprasimo.variable} ${figtree.variable}`}>
      <body>
        <Providers>
          {/* AppShell owns the viewport-filling root, the single scroll container,
              the per-viewport padding and the nav/feedback siblings (spec 010,
              research D2). Rules live in src/ so they are unit-testable —
              app/layout.tsx is excluded from coverage. */}
          <AppShell>
            {/* Brand header is `xl:hidden`: at desktop the sidebar carries the
                brand row, and two wordmarks on one screen is the duplication
                that would otherwise result (research D2). */}
            <header className="mb-5 flex items-center gap-3 xl:hidden">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-bg"
              >
                <Refrigerator size={21} strokeWidth={2.75} />
              </span>
              <span className="font-heading text-[22px] text-ink">Fridge Planner</span>
            </header>
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
