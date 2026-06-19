import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '@/test/helpers/render';

import HomePage from './page';

describe('HomePage', () => {
  it('mounts and renders the welcome hero', () => {
    renderWithProviders(<HomePage />);
    expect(
      screen.getByRole('heading', { name: /rank the games you actually love/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start ranking/i })).toBeInTheDocument();
  });
});
