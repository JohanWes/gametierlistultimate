import { beforeEach, describe, expect, it } from 'vitest';

import { resetStore, useStore } from '@/lib/store';
import { renderWithProviders, screen } from '@/test/helpers/render';

import HomePage from './page';

describe('HomePage', () => {
  beforeEach(() => {
    resetStore();
    useStore.getState().setHydrated(true);
  });

  it('mounts and renders the welcome hero', () => {
    renderWithProviders(<HomePage />);
    expect(
      screen.getByRole('heading', { name: /build your ultimate game tier list/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /press start/i })).toBeInTheDocument();
  });
});
