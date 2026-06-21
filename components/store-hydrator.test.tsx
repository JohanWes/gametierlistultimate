import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Game } from '@/lib/games/types';
import { LOCAL_SESSION_KEY, type LocalSessionState } from '@/lib/session-local';
import { resetStore, useStore } from '@/lib/store';
import { renderWithProviders, waitFor } from '@/test/helpers/render';

import { StoreHydrator } from './StoreHydrator';

function game(igdbId: number): Game {
  return {
    igdbId,
    title: `Game ${igdbId}`,
    coverUrl: null,
    genres: [],
    platforms: [],
    releaseYear: null,
    popularity: null,
    rating: null,
    summary: null,
    hasCover: false,
    category: null,
  };
}

function seedLocalSession(state: LocalSessionState) {
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(state));
}

describe('StoreHydrator', () => {
  beforeEach(() => {
    resetStore();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores the saved pool (with statuses) and step from localStorage without any network', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchImpl);

    const pool = Array.from({ length: 12 }, (_, i) => ({
      game: game(i + 1),
      status: 'played-a-lot' as const,
    }));
    seedLocalSession({ prefs: { genres: [], platforms: [], flags: {} }, pool, scores: {}, step: 'arcade' });

    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    expect(useStore.getState().pool.map((e) => e.game.igdbId)).toEqual(pool.map((e) => e.game.igdbId));
    expect(useStore.getState().pool.every((e) => e.status === 'played-a-lot')).toBe(true);
    expect(useStore.getState().ui.step).toBe('arcade');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to the pool step when the saved pool is too small for an advanced step', async () => {
    const pool = [1, 2, 3].map((id) => ({ game: game(id), status: 'finished' as const }));
    seedLocalSession({ prefs: { genres: [], platforms: [], flags: {} }, pool, scores: {}, step: 'reveal' });

    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    expect(useStore.getState().pool.map((e) => e.game.igdbId)).toEqual([1, 2, 3]);
    expect(useStore.getState().ui.step).toBe('pool');
  });

  it('stays on the welcome step when there is no saved local session', async () => {
    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    expect(useStore.getState().pool).toEqual([]);
    expect(useStore.getState().ui.step).toBe('welcome');
  });
});
