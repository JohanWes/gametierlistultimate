import { beforeEach, describe, expect, it } from 'vitest';

import { Flow } from '@/components/Flow';
import {
  assignTier,
  computeTiers,
  createRankingState,
  tierForRating,
  TIER_ORDER,
  type Tier,
} from '@/lib/ranking';
import { LOCAL_SESSION_KEY } from '@/lib/session-local';
import { resetStore, startAutosave, useStore } from '@/lib/store';
import { mockFetch } from '@/test/helpers/fetch';
import { makeGames } from '@/test/helpers/games';
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '@/test/helpers/render';

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
  useStore.getState().setScores(state);
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

    const state = useStore.getState().scores!;
    expect(tierForRating(state.games[7].rating)).toBe('S');
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

  it('keeps the move when returning to a kept-alive arcade and playing on', async () => {
    seed();
    act(() => {
      useStore.getState().setHydrated(true);
      useStore.getState().setStep('arcade');
    });
    renderWithProviders(<Flow />);
    await screen.findByTestId('arcade-round');

    act(() => useStore.getState().setStep('reveal'));
    fireEvent.click(await screen.findByRole('button', { name: /reveal all/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Game 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to S tier' }));

    fireEvent.click(screen.getByRole('button', { name: /keep ranking/i }));
    fireEvent.click(await screen.findByRole('button', { name: /skip/i }));

    const state = useStore.getState().scores!;
    expect(state.round).toBe(1);
    expect(computeTiers(state).S).toContain(7);
  });

  it('deletes a game from the board and the pool after confirming', () => {
    seed();
    renderWithProviders(<ResultStep />);
    revealAll();

    expect(screen.getByText('Game 7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Game 7' }));
    // Confirm in the dialog.
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }));

    expect(screen.queryByText('Game 7')).not.toBeInTheDocument();
    expect(useStore.getState().pool.some((e) => e.game.igdbId === 7)).toBe(false);
    expect(useStore.getState().scores!.games[7]).toBeUndefined();
  });

  it('keeps the game when the deletion is cancelled', () => {
    seed();
    renderWithProviders(<ResultStep />);
    revealAll();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Game 7' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));

    expect(screen.getByText('Game 7')).toBeInTheDocument();
    expect(useStore.getState().pool.some((e) => e.game.igdbId === 7)).toBe(true);
  });

  it('persists a manual move locally (localStorage, no network)', async () => {
    const fetchSpy = mockFetch();
    window.localStorage.clear();
    seed();
    useStore.getState().setHydrated(true);
    const stop = startAutosave();

    renderWithProviders(<ResultStep />);
    revealAll();
    fireEvent.click(screen.getByRole('button', { name: 'Move Game 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to S tier' }));

    await waitFor(
      () => {
        const saved = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) as string);
        expect(tierForRating(saved.scores.games[7].rating)).toBe('S');
      },
      { timeout: 2000 }, // past the 600ms autosave debounce
    );
    expect(fetchSpy).not.toHaveBeenCalled(); // a tier move is local-only
    stop();
  });
});
