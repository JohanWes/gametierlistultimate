import { http, HttpResponse } from 'msw';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { COLLECTIONS } from '@/lib/mongo';
import { IGDB_GAMES_URL, IGDB_TOKEN_URL, resetIgdbToken } from '@/lib/igdb';
import { mswServer } from '@/test/helpers/msw';
import { withMemoryMongo, type MemoryMongo } from '@/test/helpers/mongo';

import { GET as searchGET } from './search/route';
import { GET as suggestionsGET } from './suggestions/route';

let mongo: MemoryMongo;

const localGames = [
  { id: 1, name: 'The Witcher 3', genre: 'RPG', platform: 'PC', rating: 92, cover: 'https://img/1.jpg' },
  { id: 2, name: 'The Witcher 2', genre: 'RPG', platform: 'PC', rating: 88, cover: 'https://img/2.jpg' },
  { id: 3, name: 'The Witcher', genre: 'RPG', platform: 'PC', rating: 85, cover: 'https://img/3.jpg' },
  { id: 4, name: 'Halo', genre: 'Shooter', platform: 'Xbox', rating: 90, cover: 'https://img/4.jpg' },
];

function req(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

beforeAll(async () => {
  mongo = await withMemoryMongo();
  vi.stubEnv('MONGODB_URI', 'mongodb://localhost:27017');
  vi.stubEnv('IGDB_CLIENT_ID', 'test-client');
  vi.stubEnv('IGDB_CLIENT_SECRET', 'test-secret');
});

afterAll(async () => {
  await mongo.teardown();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  await mongo.clear();
  await mongo.db.collection(COLLECTIONS.games).insertMany(localGames.map((g) => ({ ...g })));
  resetIgdbToken();
});

describe('GET /api/games/search', () => {
  it('returns local results without calling IGDB when local is sufficient', async () => {
    let igdbHit = false;
    mswServer.use(http.post(IGDB_GAMES_URL, () => ((igdbHit = true), HttpResponse.json([]))));

    const res = await searchGET(req('/api/games/search?q=witcher'));
    const body = await res.json();

    expect(body.source).toBe('local');
    expect(body.results.length).toBeGreaterThanOrEqual(3);
    expect(body.results.every((r: { source: string }) => r.source === 'local')).toBe(true);
    expect(igdbHit).toBe(false);
  });

  it('falls back to IGDB and upserts when local is empty', async () => {
    mswServer.use(
      http.post(IGDB_TOKEN_URL, () => HttpResponse.json({ access_token: 't', expires_in: 3600 })),
      http.post(IGDB_GAMES_URL, () =>
        HttpResponse.json([
          { id: 9001, name: 'Obscure Indie Gem', cover: { image_id: 'gem' }, category: 0 },
        ]),
      ),
    );

    const res = await searchGET(req('/api/games/search?q=ObscureIndieGem'));
    const body = await res.json();

    expect(body.source).toBe('igdb');
    expect(body.results.some((r: { igdbId: number; source: string }) => r.igdbId === 9001 && r.source === 'igdb')).toBe(true);

    // Assert the IGDB result was persisted to Mongo.
    const stored = await mongo.db.collection(COLLECTIONS.games).findOne({ id: 9001 });
    expect(stored?.name).toBe('Obscure Indie Gem');
  });

  it('returns empty results for a blank query', async () => {
    const res = await searchGET(req('/api/games/search?q='));
    expect(await res.json()).toEqual({ results: [], source: 'local' });
  });
});

describe('GET /api/games/suggestions', () => {
  it('returns cover-bearing, non-excluded games honoring the limit', async () => {
    const res = await suggestionsGET(req('/api/games/suggestions?exclude=4&limit=2'));
    const body = await res.json();
    expect(body.games).toHaveLength(2);
    expect(body.games.map((g: { igdbId: number }) => g.igdbId)).not.toContain(4);
  });

  it('biases toward preferred genres', async () => {
    const res = await suggestionsGET(req('/api/games/suggestions?genres=rpg&limit=3'));
    const body = await res.json();
    expect(body.games[0].genres).toContain('RPG');
  });
});
