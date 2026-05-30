import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { Nav } from './nav';
import '../src/index.css';

export const metadata: Metadata = {
  title: { default: 'Fridge Planner', template: '%s | Fridge Planner' },
  description: 'AI-powered meal planning and fridge inventory management',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <Providers>
          <main className="min-h-screen bg-gray-50">
            <header className="border-b border-gray-200 bg-white px-4 py-4 mb-6">
              <div className="max-w-6xl mx-auto flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Fridge Planner</h1>
                <Nav />
              </div>
            </header>
            <div className="max-w-6xl mx-auto px-4 pb-8">
              {children}
            </div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
