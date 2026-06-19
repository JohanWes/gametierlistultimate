import { beforeEach, describe, expect, it } from 'vitest';

import { resetStore, useStore } from '@/lib/store';
import { makeGames, jsonFetch } from '@/test/helpers/games';
import { act, renderWithProviders, screen } from '@/test/helpers/render';

import { PoolStep } from './PoolStep';

/** Render PoolStep with a pre-seeded pool of `count` games and an empty suggestions feed. */
async function renderWithPool(count: number) {
  for (const game of makeGames(count)) {
    useStore.getState().addToPool(game);
  }
  await act(async () => {
    renderWithProviders(<PoolStep fetchImpl={jsonFetch({ games: [] })} />);
  });
}

describe('PoolStep progress gating', () => {
  beforeEach(() => resetStore());

  it('keeps Continue disabled and shows the building message below the minimum', async () => {
    await renderWithPool(0);
    expect(screen.getByText(/building your roster — 12 more to start/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enter the arcade/i })).toBeDisabled();
  });

  it('enables Continue and shows the playable message at the minimum', async () => {
    await renderWithPool(12);
    expect(
      screen.getByText(/your list is playable now, but adding more games will make it better/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enter the arcade/i })).toBeEnabled();
  });

  it('shows the recommended message in the recommended band', async () => {
    await renderWithPool(40);
    expect(screen.getByText(/recommended size — this is a strong list/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enter the arcade/i })).toBeEnabled();
  });
});
