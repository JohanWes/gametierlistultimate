import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyOutcome,
  createRankingState,
  parseRankingState,
  serializeRankingState,
} from '@/lib/ranking';
import { LOCAL_SESSION_KEY } from '@/lib/session-local';
import { resetStore, startAutosave, useStore } from '@/lib/store';
import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor, within } from '@/test/helpers/render';

import { ArcadeStep } from './ArcadeStep';

function seedPool(count = 6) {
  const games = makeGames(count);
  const add = useStore.getState().addToPool;
  for (const g of games) add(g, 'finished');
  return games;
}

describe('ArcadeStep', () => {
  beforeEach(() => resetStore());

  it('a completed round updates the hidden ranking and persists it locally', async () => {
    const fetchSpy = vi.fn(
      async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response,
    );
    window.localStorage.clear();
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
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem(LOCAL_SESSION_KEY) as string);
      expect(parseRankingState(saved.scores)?.round).toBe(1);
    });
    expect(fetchSpy).not.toHaveBeenCalled(); // a score change is local-only

    stop();
  });

  it('deletes a game from the pool and resets the round after confirming', () => {
    seedPool(6);
    renderWithProviders(<ArcadeStep />);

    const roundBefore = screen.getByTestId('arcade-round').textContent;

    // Each visible cover carries a delete-X ("Remove Game N").
    const removeBtn = screen.getAllByRole('button', { name: /^Remove Game \d+$/i })[0];
    const id = Number(/Game (\d+)/.exec(removeBtn.getAttribute('aria-label') ?? '')?.[1]);
    expect(Number.isFinite(id)).toBe(true);

    fireEvent.click(removeBtn);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }));

    expect(useStore.getState().pool.some((e) => e.game.igdbId === id)).toBe(false);
    expect(useStore.getState().pool).toHaveLength(5);
    expect(parseRankingState(useStore.getState().scores)?.games[id]).toBeUndefined();
    // The current round was discarded, not completed — the round counter does not advance.
    expect(screen.getByTestId('arcade-round').textContent).toBe(roundBefore);
    // A fresh round still renders.
    expect(screen.getAllByRole('button', { name: /^Game \d+$/i }).length).toBeGreaterThan(0);
  });

  it('keeps the game when the deletion is cancelled', () => {
    seedPool(6);
    renderWithProviders(<ArcadeStep />);

    const removeBtn = screen.getAllByRole('button', { name: /^Remove Game \d+$/i })[0];
    fireEvent.click(removeBtn);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));

    expect(useStore.getState().pool).toHaveLength(6);
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
