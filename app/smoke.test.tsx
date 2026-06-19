import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '@/test/helpers/render';

import HomePage from './page';

describe('HomePage', () => {
  it('mounts and renders the welcome hero', () => {
    renderWithProviders(<HomePage />);
    expect(
      screen.getByRole('heading', { name: /build your ultimate game tier list/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /press start/i })).toBeInTheDocument();
  });
});
