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

export * from '@testing-library/react';
