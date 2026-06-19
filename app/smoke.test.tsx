import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '@/test/helpers/render';

import HomePage from './page';

describe('HomePage', () => {
  it('mounts and renders the app title', () => {
    renderWithProviders(<HomePage />);
    expect(screen.getByRole('heading', { name: 'Ultimate Game Tier List' })).toBeInTheDocument();
  });
});
