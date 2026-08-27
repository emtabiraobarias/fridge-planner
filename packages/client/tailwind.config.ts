import type { Config } from 'tailwindcss';
import { PHONE_LANDSCAPE_QUERY } from './src/lib/viewport';

/**
 * Organic design system tokens (spec 004 — Phase G).
 * Canonical values: specs/004-organic-redesign/design/organic-design-system.md
 *
 * Spec 010 adds the five responsive viewport classes via `extend.screens`
 * (design/responsive-system.md §1.1, research D1).
 */
export default {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // The five spec-010 viewport classes. `extend`, NEVER `theme.screens` —
      // replacing the map would break the `sm:`/`lg:`/`min-[900px]:` utilities
      // already shipped. Four classes reuse Tailwind's defaults, which already
      // sit on the design's boundaries; only phone landscape needs a raw query.
      //
      // ORDER IS LOAD-BEARING: Tailwind emits screen variants in declaration
      // order, so `phland` MUST stay LAST — a phone in landscape is ~844px wide
      // and therefore also matches `sm:`, and only the last-declared query wins
      // at equal specificity (research D1; proven by the 844×390
      // `padding-left: 96px` assertion in e2e/responsive.e2e.ts).
      // NOTE: a `screens` map containing an object (the `phland` raw query below)
      // disables Tailwind's arbitrary `min-[…]:`/`max-[…]:` variants build-wide.
      // `min900` therefore replaces the one shipped `min-[900px]:` utility
      // (src/views/InventoryPage.tsx). Use named screens only from here on.
      screens: {
        sm: '640px', // iPad portrait  640–1023px
        min900: '900px', // shipped 004 Kitchen two-column threshold
        lg: '1024px', // iPad landscape 1024–1279px
        xl: '1280px', // desktop       ≥1280px
        // Overlay presentation: sheet on touch, centred dialog on a real pointer.
        //
        // The overlay used to switch on `xl:` alone, which asks the wrong question. Width does
        // not distinguish a laptop from an iPad: a 1024–1279px laptop window got a bottom sheet
        // pinned across the whole screen, and an 1280px+ touch device would get a dialog. What
        // the design means by "desktop" here is a fine pointer, so this asks that directly and
        // keeps a width floor so small windows still get the sheet.
        dlg: { raw: '(min-width: 1024px) and (pointer: fine)' },
        phland: { raw: PHONE_LANDSCAPE_QUERY }, // phone landscape — KEEP LAST
      },
      colors: {
        bg: '#f5ead8',
        surface: '#ebddc5',
        ink: '#201e1d',
        divider: 'rgba(32,30,29,0.16)',
        accent: {
          DEFAULT: '#c67139',
          100: '#fff2eb',
          200: '#ffe1d0',
          300: '#ffc6a5',
          400: '#f6a06b',
          500: '#d67f48',
          600: '#b2622d',
          700: '#8c491a',
          800: '#643312',
          900: '#402310',
        },
        accent2: {
          DEFAULT: '#7a8a5e',
          100: '#f0fae1',
          200: '#e1eecc',
          300: '#ccdbb2',
          400: '#aebf92',
          500: '#8fa073',
          600: '#728157',
          700: '#56633f',
          800: '#3d472b',
          900: '#272e1b',
        },
        neutral: {
          100: '#f9f4ed',
          200: '#eee7db',
          300: '#dcd3c4',
          400: '#c0b6a5',
          500: '#a19786',
          600: '#82796a',
          700: '#645c50',
          800: '#474238',
          900: '#2e2b25',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Organic heading scale (design reference §1)
        h1: ['42px', { lineHeight: '1.12', letterSpacing: '-0.015em' }],
        h2: ['32px', { lineHeight: '1.12', letterSpacing: '-0.015em' }],
        h3: ['25px', { lineHeight: '1.12', letterSpacing: '-0.015em' }],
        h4: ['20px', { lineHeight: '1.12', letterSpacing: '-0.015em' }],
        h5: ['16px', { lineHeight: '1.12', letterSpacing: '-0.015em' }],
        h6: ['13px', { lineHeight: '1.12', letterSpacing: '0.08em' }],
      },
      borderRadius: {
        sm: '8px',
        md: '16px',
        lg: '28px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(46,43,37,0.14)',
        md: '0 3px 10px rgba(46,43,37,0.16)',
        lg: '0 12px 32px rgba(46,43,37,0.22)',
      },
      maxWidth: {
        shell: '1160px',
        // Desktop content cap, centred (design/responsive-system.md §1.3).
        content: '1120px',
      },
    },
  },
  plugins: [],
} satisfies Config;
