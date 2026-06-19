import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * Thin wrapper around RTL's render. A provider shell (theme, store) will be added here in
 * Phase 3; centralizing it now means component tests don't change when that lands.
 */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions) {
  return render(ui, options);
}

export * from '@testing-library/react';
