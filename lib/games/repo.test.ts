import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '@/lib/mongo';
import { withMemoryMongo, type MemoryMongo } from '@/test/helpers/mongo';

import { getByIds, getSuggestions, searchLocal, upsertGames } from './repo';

let mongo: MemoryMongo;

const fixtures = [
  { id: 1, name: 'The Witcher 3', genre: 'Role-playing (RPG)', platform: 'PC', rating: 92, cover: 'https://img/w3.jpg' },
  { id: 2, name: 'Witcher 2', genre: 'Role-playing (RPG)', platform: 'PC', rating: 88, cover: 'https://img/w2.jpg' },
  { id: 3, name: 'FIFA 23', genre: 'Sport', platform: 'PS5', rating: 79, cover: 'https://img/fifa.jpg' },
  { id: 4, name: 'No Cover Game', genre: 'Indie', platform: 'PC', rating: 95, cover: '' },
  { id: 5, name: 'Some DLC', genre: 'Role-playing (RPG)', platform: 'PC', rating: 99, cover: 'https://img/dlc.jpg', category: 1 },
  { id: 6, name: 'Halo', genre: 'Shooter', platform: 'Xbox', rating: 90, cover: 'https://img/halo.jpg' },
];

beforeAll(async () => {
  mongo = await withMemoryMongo();
});

afterAll(async () => {
  await mongo.teardown();
});

beforeEach(async () => {
  await mongo.clear();
  await mongo.db.collection(COLLECTIONS.games).insertMany(fixtures.map((f) => ({ ...f })));
});

describe('getSuggestions', () => {
  it('excludes given ids, DLC, and coverless games', async () => {
    const games = await getSuggestions({}, [6], 10);
    const ids = games.map((g) => g.igdbId);
    expect(ids).not.toContain(6); // excluded
    expect(ids).not.toContain(5); // DLC (category 1)
    expect(ids).not.toContain(4); // no cover
    expect(games.every((g) => g.hasCover)).toBe(true);
  });

  it('prefers preferred genres but tops up to honor the limit', async () => {
    const games = await getSuggestions({ genres: ['role-playing (rpg)'] }, [], 3);
    expect(games).toHaveLength(3);
    // The two RPGs (ids 1,2) should come before non-RPG filler.
    expect(games.slice(0, 2).map((g) => g.igdbId).sort()).toEqual([1, 2]);
  });

  it('respects the limit', async () => {
    const games = await getSuggestions({}, [], 2);
    expect(games).toHaveLength(2);
  });
});

describe('searchLocal', () => {
  it('matches partial, case-insensitive titles', async () => {
    const games = await searchLocal('witcher');
    expect(games.map((g) => g.title).sort()).toEqual(['The Witcher 3', 'Witcher 2']);
  });

  it('returns [] for an empty query', async () => {
    expect(await searchLocal('   ')).toEqual([]);
  });
});

describe('getByIds', () => {
  it('hydrates games preserving requested order and skipping unknowns', async () => {
    const games = await getByIds([3, 999, 1]);
    expect(games.map((g) => g.igdbId)).toEqual([3, 1]);
  });

  it('returns [] for empty input', async () => {
    expect(await getByIds([])).toEqual([]);
  });
});

describe('upsertGames', () => {
  it('inserts new games and updates existing ones (keyed on igdbId)', async () => {
    await upsertGames([
      {
        igdbId: 100,
        title: 'New From IGDB',
        coverUrl: 'https://img/new.jpg',
        genres: ['Adventure'],
        platforms: ['PC'],
        releaseYear: 2020,
        popularity: 10,
        rating: 80,
        summary: null,
        hasCover: true,
        category: 0,
      },
    ]);
    const found = await getByIds([100]);
    expect(found).toHaveLength(1);
    expect(found[0].title).toBe('New From IGDB');
  });
});
