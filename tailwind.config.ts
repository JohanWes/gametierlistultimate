import type { Config } from 'tailwindcss';

/**
 * Placeholder dark theme token set. Colors are wired to CSS variables defined in
 * app/globals.css so the design system can be refined in Phase 3 without touching markup.
 */
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-elevated': 'rgb(var(--color-surface-elevated) / <alpha-value>)',
        fg: 'rgb(var(--color-fg) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
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
    },
  },
  plugins: [],
};

export default config;
