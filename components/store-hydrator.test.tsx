import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Game } from '@/lib/games/types';
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

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe('StoreHydrator', () => {
  beforeEach(() => {
    resetStore();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores saved pool games before resuming an advanced step', async () => {
    const games = Array.from({ length: 12 }, (_, i) => game(i + 1));
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/session') {
        return jsonResponse({
          session: {
            pool: games.map((g) => g.igdbId),
            step: 'arcade',
          },
        });
      }
      if (url.startsWith('/api/games/by-ids?')) {
        return jsonResponse({ games });
      }
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchImpl);

    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    expect(useStore.getState().pool.map((entry) => entry.game.igdbId)).toEqual(
      games.map((g) => g.igdbId),
    );
    expect(useStore.getState().ui.step).toBe('arcade');
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/games/by-ids?ids=1%2C2%2C3%2C4%2C5%2C6%2C7%2C8%2C9%2C10%2C11%2C12',
      { credentials: 'same-origin' },
    );
  });

  it('falls back to the pool step when advanced resume games cannot be restored', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/session') {
        return jsonResponse({
          session: {
            pool: [1, 2, 3],
            step: 'reveal',
          },
        });
      }
      if (url.startsWith('/api/games/by-ids?')) return jsonResponse({ games: [] });
      return jsonResponse({ ok: true });
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchImpl);

    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    expect(useStore.getState().pool).toEqual([]);
    expect(useStore.getState().poolIds).toEqual([1, 2, 3]);
    expect(useStore.getState().ui.step).toBe('pool');
  });
});
