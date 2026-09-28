import type { Config } from 'tailwindcss';

/**
 * Arcade Premium design system. Colors stay wired to the CSS variables defined in
 * app/globals.css so the palette can be tuned without touching markup. Fonts come from
 * next/font (see app/layout.tsx) exposed as CSS variables.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-elevated': 'rgb(var(--color-surface-elevated) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        fg: 'rgb(var(--color-fg) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        ring: 'rgb(var(--color-ring) / <alpha-value>)',
        teal: 'rgb(var(--color-teal) / <alpha-value>)',
        coin: 'rgb(var(--color-coin) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        tier: {
          s: 'rgb(var(--tier-s) / <alpha-value>)',
          a: 'rgb(var(--tier-a) / <alpha-value>)',
          b: 'rgb(var(--tier-b) / <alpha-value>)',
          c: 'rgb(var(--tier-c) / <alpha-value>)',
          d: 'rgb(var(--tier-d) / <alpha-value>)',
          e: 'rgb(var(--tier-e) / <alpha-value>)',
          f: 'rgb(var(--tier-f) / <alpha-value>)',
        },
      },
      spacing: {
        13: '3.25rem',
      },
      // Off-scale alpha steps used as color modifiers (e.g. `bg-panel/86`).
      opacity: {
        12: '0.12',
        22: '0.22',
        72: '0.72',
        86: '0.86',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        card: '0.375rem',
        tile: '0.1875rem',
        control: '0.625rem',
        hardware: '9999px',
      },
      boxShadow: {
        soft: '0 2px 0 rgb(0 0 0 / 0.7)',
        lift: '0 16px 0 -10px rgb(0 0 0 / 0.85), 0 22px 44px -24px rgb(0 0 0 / 0.85)',
        cabinet:
          'inset 0 1px 0 rgb(255 255 255 / 0.08), inset 0 -2px 0 rgb(0 0 0 / 0.45), 0 18px 40px -24px rgb(0 0 0 / 0.9)',
        marquee:
          'inset 0 1px 0 rgb(255 255 255 / 0.08), inset 0 -2px 0 rgb(0 0 0 / 0.45), 0 0 0 1px rgb(var(--color-accent) / 0.55), 0 6px 22px -6px rgb(var(--color-accent) / 0.4), 0 22px 48px -26px rgb(0 0 0 / 0.9)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
