import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  peekAdaptiveBatch,
  peekStarterBatch,
  prefetchAdaptiveBatch,
  prefetchStarterBatch,
  resetStarterBatchPrefetch,
} from './prefetch';
import type { Game } from './types';

const game = (igdbId: number, coverUrl: string): Game => ({
  igdbId,
  title: `Game ${igdbId}`,
  coverUrl,
  genres: [],
  platforms: [],
  releaseYear: null,
  popularity: null,
  rating: null,
  summary: null,
  hasCover: true,
  category: null,
});

describe('prefetchStarterBatch', () => {
  afterEach(() => resetStarterBatchPrefetch());

  it('requests the preset shelf once and caches the resolved batch', async () => {
    const games = [game(1, '/assets/starter/a.jpg'), game(2, '/assets/starter/b.jpg')];
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ games }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    prefetchStarterBatch(3, fetchImpl as unknown as typeof fetch);
    prefetchStarterBatch(3, fetchImpl as unknown as typeof fetch); // already in flight → no-op

    const result = await peekStarterBatch();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0][0] as string)).toContain('preset=true');
    expect(result?.map((g) => g.igdbId)).toEqual([1, 2]);
  });

  it('clears the cache on failure so a later call can retry', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }));
    prefetchStarterBatch(3, fetchImpl as unknown as typeof fetch);
    await peekStarterBatch();
    expect(peekStarterBatch()).toBeNull();
  });
});

describe('prefetchAdaptiveBatch', () => {
  afterEach(() => resetStarterBatchPrefetch());

  it('sends seed/exclude/prefs params and caches the resolved batch', async () => {
    const games = [game(10, '/assets/starter/a.jpg'), game(11, '/assets/starter/b.jpg')];
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ games }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const query = {
      seedIds: [1, 2, 3],
      rejectIds: [4],
      exclude: [1, 2, 3],
      prefs: { genres: ['RPG'], platforms: [] },
      limit: 3,
    };
    prefetchAdaptiveBatch(query, fetchImpl as unknown as typeof fetch);
    prefetchAdaptiveBatch(query, fetchImpl as unknown as typeof fetch); // already in flight → no-op

    const result = await peekAdaptiveBatch();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = decodeURIComponent(fetchImpl.mock.calls[0][0] as string);
    expect(url).toContain('seedIds=1,2,3');
    expect(url).toContain('rejectIds=4');
    expect(url).toContain('exclude=1,2,3');
    expect(url).toContain('genres=RPG');
    expect(url).toContain('limit=3');
    expect(result?.map((g) => g.igdbId)).toEqual([10, 11]);
  });

  it('clears the cache on failure so a later call can retry', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }));
    prefetchAdaptiveBatch(
      { seedIds: [1], rejectIds: [], exclude: [1], prefs: {}, limit: 3 },
      fetchImpl as unknown as typeof fetch,
    );
    await peekAdaptiveBatch();
    expect(peekAdaptiveBatch()).toBeNull();
  });
});
