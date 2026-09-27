import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * Thin wrapper around RTL's render. The theme is global CSS and the Zustand store is a module
 * singleton (no React provider needed), so there is nothing to wrap yet — but tests import
 * from here so a future provider can be added in one place without touching every test.
 */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(ui, options);
}

/**
 * Make `prefers-reduced-motion: reduce` match for the rest of this test file, so minigames resolve
 * without waiting on their animation beats (see `useComplete`). Call at module scope: Framer
 * Motion reads the preference once, on first use.
 */
export function preferReducedMotion() {
  const matchMedia = window.matchMedia;
  window.matchMedia = (query: string) =>
    ({ ...matchMedia(query), matches: query.includes('prefers-reduced-motion') }) as MediaQueryList;
}

export * from '@testing-library/react';
