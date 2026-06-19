import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyOutcome,
  createRankingState,
  parseRankingState,
  serializeRankingState,
} from '@/lib/ranking';
import { resetStore, startAutosave, useStore } from '@/lib/store';
import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { ArcadeStep } from './ArcadeStep';

function seedPool(count = 6) {
  const games = makeGames(count);
  const add = useStore.getState().addToPool;
  for (const g of games) add(g, 'finished');
  return games;
}

describe('ArcadeStep', () => {
  beforeEach(() => resetStore());

  it('a completed round updates the hidden ranking and autosaves', async () => {
    const fetchSpy = vi.fn(
      async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response,
    );
    seedPool(6);
    useStore.getState().setHydrated(true);
    const stop = startAutosave({ waitMs: 0, fetchImpl: fetchSpy as unknown as typeof fetch });

    renderWithProviders(<ArcadeStep />);

    // The first early round is a five-card group game; click any cover to resolve it.
    const cards = screen.getAllByRole('button', { name: /^Game \d+$/i });
    fireEvent.click(cards[0]);

    await waitFor(() => {
      expect(parseRankingState(useStore.getState().scores)?.round).toBe(1);
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    stop();
  });

  it('hides the reveal until the list is good enough', () => {
    seedPool(6);
    renderWithProviders(<ArcadeStep />);

    expect(screen.queryByRole('button', { name: /reveal/i })).not.toBeInTheDocument();
    expect(screen.getByText(/keep playing to unlock/i)).toBeInTheDocument();
  });

  it('offers the reveal once the round floor is reached', () => {
    const games = seedPool(6);
    let state = createRankingState(games.map((g) => ({ gameId: g.igdbId })));
    for (let i = 0; i < 12; i += 1) {
      state = applyOutcome(state, {
        type: 'pairwise',
        winnerId: games[0].igdbId,
        loserId: games[1].igdbId,
      });
    }
    useStore
      .getState()
      .setScores(serializeRankingState(state) as unknown as Record<string, unknown>);

    renderWithProviders(<ArcadeStep />);

    expect(screen.getByRole('button', { name: /reveal/i })).toBeInTheDocument();
  });
});
