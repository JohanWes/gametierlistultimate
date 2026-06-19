import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mswServer } from '@/test/helpers/msw';

import { IGDB_GAMES_URL, IGDB_TOKEN_URL, resetIgdbToken, searchIgdb } from './igdb';

const env = {
  MONGODB_URI: 'mongodb://localhost:27017',
  IGDB_CLIENT_ID: 'test-client',
  IGDB_CLIENT_SECRET: 'test-secret',
};

beforeEach(() => {
  resetIgdbToken();
  vi.stubEnv('MONGODB_URI', env.MONGODB_URI);
  vi.stubEnv('IGDB_CLIENT_ID', env.IGDB_CLIENT_ID);
  vi.stubEnv('IGDB_CLIENT_SECRET', env.IGDB_CLIENT_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('searchIgdb', () => {
  it('fetches a token, reuses it across calls, and normalizes results', async () => {
    let tokenCalls = 0;
    mswServer.use(
      http.post(IGDB_TOKEN_URL, () => {
        tokenCalls += 1;
        return HttpResponse.json({ access_token: 't0ken', expires_in: 3600 });
      }),
      http.post(IGDB_GAMES_URL, async ({ request }) => {
        expect(request.headers.get('Client-ID')).toBe(env.IGDB_CLIENT_ID);
        expect(request.headers.get('Authorization')).toBe('Bearer t0ken');
        return HttpResponse.json([
          {
            id: 1942,
            name: 'The Witcher 3',
            cover: { image_id: 'coaarl' },
            genres: [{ name: 'RPG' }],
            platforms: [{ name: 'PC' }],
            first_release_date: 1431993600,
            rating: 91.6,
            category: 0,
          },
        ]);
      }),
    );

    const first = await searchIgdb('witcher');
    const second = await searchIgdb('witcher again');

    expect(tokenCalls).toBe(1); // token cached between calls
    expect(first[0].title).toBe('The Witcher 3');
    expect(first[0].coverUrl).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg',
    );
    expect(first[0].rating).toBe(92);
    expect(second).toHaveLength(1);
  });

  it('returns [] for an empty query without hitting the network', async () => {
    let hit = false;
    mswServer.use(http.post(IGDB_TOKEN_URL, () => ((hit = true), HttpResponse.json({}))));
    expect(await searchIgdb('   ')).toEqual([]);
    expect(hit).toBe(false);
  });

  it('throws a clear error when IGDB returns an error status', async () => {
    mswServer.use(
      http.post(IGDB_TOKEN_URL, () => HttpResponse.json({ access_token: 'x', expires_in: 3600 })),
      http.post(IGDB_GAMES_URL, () => new HttpResponse(null, { status: 500 })),
    );
    await expect(searchIgdb('boom')).rejects.toThrow(/IGDB search failed: 500/);
  });
});
