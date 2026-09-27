import { afterEach, describe, expect, it } from 'vitest';

import { mockFetch } from '@/test/helpers/fetch';

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
  releaseYear: null,
  popularity: null,
  rating: null,
  category: null,
});

describe('prefetchStarterBatch', () => {
  afterEach(() => resetStarterBatchPrefetch());

  it('requests the preset shelf once and caches the resolved batch', async () => {
    const games = [game(1, '/assets/starter/a.jpg'), game(2, '/assets/starter/b.jpg')];
    const fetchMock = mockFetch(() => ({ games }));

    prefetchStarterBatch(3);
    prefetchStarterBatch(3); // already in flight → no-op

    const result = await peekStarterBatch();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('preset=true');
    expect(result?.map((g) => g.igdbId)).toEqual([1, 2]);
  });

  it('clears the cache on failure so a later call can retry', async () => {
    mockFetch(() => new Response('nope', { status: 500 }));
    prefetchStarterBatch(3);
    await peekStarterBatch();
    expect(peekStarterBatch()).toBeNull();
  });
});

describe('prefetchAdaptiveBatch', () => {
  afterEach(() => resetStarterBatchPrefetch());

  it('sends seed/exclude params and caches the resolved batch', async () => {
    const games = [game(10, '/assets/starter/a.jpg'), game(11, '/assets/starter/b.jpg')];
    const fetchMock = mockFetch(() => ({ games }));

    const query = {
      seedIds: [1, 2, 3],
      rejectIds: [4],
      exclude: [1, 2, 3],
      limit: 3,
    };
    prefetchAdaptiveBatch(query);
    prefetchAdaptiveBatch(query); // already in flight → no-op

    const result = await peekAdaptiveBatch();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = decodeURIComponent(fetchMock.mock.calls[0][0] as string);
    expect(url).toContain('seedIds=1,2,3');
    expect(url).toContain('rejectIds=4');
    expect(url).toContain('exclude=1,2,3');
    expect(url).toContain('limit=3');
    expect(result?.map((g) => g.igdbId)).toEqual([10, 11]);
  });

  it('clears the cache on failure so a later call can retry', async () => {
    mockFetch(() => new Response('nope', { status: 500 }));
    prefetchAdaptiveBatch({ seedIds: [1], rejectIds: [], exclude: [1], limit: 3 });
    await peekAdaptiveBatch();
    expect(peekAdaptiveBatch()).toBeNull();
  });
});
