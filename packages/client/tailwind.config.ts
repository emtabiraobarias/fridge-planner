import type { Config } from 'tailwindcss';

/**
 * Organic design system tokens (spec 004 — Phase G).
 * Canonical values: specs/004-organic-redesign/design/organic-design-system.md
 */
export default {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
      },
    },
  },
  plugins: [],
} satisfies Config;
