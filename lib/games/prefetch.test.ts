import { afterEach, describe, expect, it, vi } from 'vitest';

import { peekStarterBatch, prefetchStarterBatch, resetStarterBatchPrefetch } from './prefetch';
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
