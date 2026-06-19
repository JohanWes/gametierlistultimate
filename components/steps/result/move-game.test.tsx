import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assignTier,
  createRankingState,
  parseRankingState,
  serializeRankingState,
  tierForRating,
  TIER_ORDER,
  type Tier,
} from '@/lib/ranking';
import { resetStore, startAutosave, useStore } from '@/lib/store';
import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor, within } from '@/test/helpers/render';

import { ResultStep } from './ResultStep';

/** Seed a pool of 7 games, one in each tier S→F. Small pool (<10) so the S-cap never interferes. */
function seed() {
  resetStore();
  const games = makeGames(7);
  const add = useStore.getState().addToPool;
  for (const g of games) add(g, 'finished');
  let state = createRankingState(games.map((g) => ({ gameId: g.igdbId })));
  TIER_ORDER.forEach((tier: Tier, i) => {
    state = assignTier(state, i + 1, tier);
  });
  useStore.getState().setScores(serializeRankingState(state) as unknown as Record<string, unknown>);
  return games;
}

/** Enter the editable phase (skip the reveal animation). */
function revealAll() {
  fireEvent.click(screen.getByRole('button', { name: /reveal all/i }));
}

describe('manual correction (tap-to-move)', () => {
  beforeEach(() => resetStore());

  it('moves a game to the chosen tier on the board and in the store', () => {
    seed();
    renderWithProviders(<ResultStep />);
    revealAll();

    // Game 7 starts in F; tap it and pick S.
    fireEvent.click(screen.getByRole('button', { name: 'Move Game 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to S tier' }));

    expect(within(screen.getByTestId('tier-row-S')).getByText('Game 7')).toBeInTheDocument();

    const state = parseRankingState(useStore.getState().scores);
    expect(state).not.toBeNull();
    expect(tierForRating(state!.games[7].rating)).toBe('S');
  });

  it('persists the move so it survives a reload (re-seed from saved scores)', () => {
    seed();
    const { unmount } = renderWithProviders(<ResultStep />);
    revealAll();
    fireEvent.click(screen.getByRole('button', { name: 'Move Game 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to S tier' }));
    unmount();

    // Remount: ResultStep re-seeds from store.scores.
    renderWithProviders(<ResultStep />);
    revealAll();
    expect(within(screen.getByTestId('tier-row-S')).getByText('Game 7')).toBeInTheDocument();
  });

  it('autosaves a manual move (PUT /api/session)', async () => {
    const fetchSpy = vi.fn(
      async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response,
    );
    seed();
    useStore.getState().setHydrated(true);
    const stop = startAutosave({ waitMs: 0, fetchImpl: fetchSpy as unknown as typeof fetch });

    renderWithProviders(<ResultStep />);
    revealAll();
    fireEvent.click(screen.getByRole('button', { name: 'Move Game 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to S tier' }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/session', expect.objectContaining({ method: 'PUT' })),
    );
    stop();
  });
});
