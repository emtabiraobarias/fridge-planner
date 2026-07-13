import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Caprasimo, Figtree } from 'next/font/google';
import { Refrigerator } from 'lucide-react';
import { Providers } from './providers';
import { Nav } from './nav';
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
          {/* Cream ground; bottom padding clears the floating tab bar. */}
          <main className="min-h-screen bg-bg pb-24">
            <div className="mx-auto max-w-shell px-7">
              <header className="flex items-center gap-3 py-6">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-bg"
                >
                  <Refrigerator size={21} strokeWidth={2.75} />
                </span>
                <span className="font-heading text-[22px] text-ink">Fridge Planner</span>
              </header>
              {children}
            </div>
          </main>
          <Nav />
        </Providers>
      </body>
    </html>
  );
}
