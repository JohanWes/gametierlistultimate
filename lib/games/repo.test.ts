import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '@/lib/mongo';
import { withMemoryMongo, type MemoryMongo } from '@/test/helpers/mongo';

import { getByIds, getSuggestions, searchLocal, upsertGames } from './repo';

let mongo: MemoryMongo;

const fixtures = [
  {
    id: 1,
    name: 'The Witcher 3',
    genre: 'Role-playing (RPG)',
    platform: 'PC',
    rating: 92,
    cover: 'https://img/w3.jpg',
  },
  {
    id: 2,
    name: 'Witcher 2',
    genre: 'Role-playing (RPG)',
    platform: 'PC',
    rating: 88,
    cover: 'https://img/w2.jpg',
  },
  {
    id: 3,
    name: 'FIFA 23',
    genre: 'Sport',
    platform: 'PS5',
    rating: 79,
    cover: 'https://img/fifa.jpg',
  },
  { id: 4, name: 'No Cover Game', genre: 'Indie', platform: 'PC', rating: 95, cover: '' },
  {
    id: 5,
    name: 'Some DLC',
    genre: 'Role-playing (RPG)',
    platform: 'PC',
    rating: 99,
    cover: 'https://img/dlc.jpg',
    category: 1,
  },
  {
    id: 6,
    name: 'Halo',
    genre: 'Shooter',
    platform: 'Xbox',
    rating: 90,
    cover: 'https://img/halo.jpg',
  },
  {
    id: 7,
    name: 'Halo Infinite',
    genre: 'Shooter',
    platform: 'Xbox',
    rating: 95,
    cover: 'https://img/halo-infinite.jpg',
  },
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
    expect(
      games
        .slice(0, 2)
        .map((g) => g.igdbId)
        .sort(),
    ).toEqual([1, 2]);
  });

  it('respects the limit', async () => {
    const games = await getSuggestions({}, [], 2);
    expect(games).toHaveLength(2);
  });

  it('filters likely expansions and edition variants while preserving subtitle main games', async () => {
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      {
        id: 20,
        name: 'Horizon Zero Dawn',
        genre: 'Adventure',
        platform: 'PC',
        rating: 70,
        cover: 'https://img/hzd.jpg',
      },
      {
        id: 21,
        name: 'Horizon Zero Dawn: The Frozen Wilds',
        genre: 'Adventure',
        platform: 'PC',
        rating: 99,
        cover: 'https://img/frozen.jpg',
      },
      {
        id: 22,
        name: 'Kingdom Come: Deliverance',
        genre: 'Role-playing (RPG)',
        platform: 'PC',
        rating: 72,
        cover: 'https://img/kcd.jpg',
      },
      {
        id: 23,
        name: 'Kingdom Come: Deliverance - Royal Edition',
        genre: 'Role-playing (RPG)',
        platform: 'PC',
        rating: 98,
        cover: 'https://img/kcd-royal.jpg',
      },
      {
        id: 24,
        name: 'God of War: Ghost of Sparta',
        genre: 'Adventure',
        platform: 'PSP',
        rating: 97,
        cover: 'https://img/gow.jpg',
      },
      {
        id: 25,
        name: 'Dragon Quest IV: Chapters of the Chosen',
        genre: 'Role-playing (RPG)',
        platform: 'DS',
        rating: 96,
        cover: 'https://img/dq4.jpg',
      },
      {
        id: 26,
        name: 'Half-Life 2: Episode One',
        genre: 'Shooter',
        platform: 'PC',
        rating: 95,
        cover: 'https://img/hl2e1.jpg',
      },
    ]);

    const games = await getSuggestions({}, [], 20);
    const ids = games.map((g) => g.igdbId);

    expect(ids).not.toContain(21);
    expect(ids).not.toContain(23);
    expect(ids).not.toContain(26);
    expect(ids).toEqual(expect.arrayContaining([20, 22, 24, 25]));
  });

  it('deduplicates canonical title matches inside a suggestion batch', async () => {
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      {
        id: 30,
        name: 'Bendy and the Dark Revival',
        genre: 'Puzzle',
        platform: 'PC',
        rating: 99,
        cover: 'https://img/bendy.jpg',
      },
      {
        id: 31,
        name: 'Bendy and the Dark Revival!',
        genre: 'Puzzle',
        platform: 'PC',
        rating: 98,
        cover: 'https://img/bendy2.jpg',
      },
    ]);

    const games = await getSuggestions({}, [], 20);

    expect(games.filter((g) => /bendy and the dark revival/i.test(g.title))).toHaveLength(1);
  });

  it('maps onboarding genre labels onto the dataset’s IGDB genre strings', async () => {
    // "Sports" (label) must match the stored "Sport" genre, so FIFA leads the results.
    const games = await getSuggestions({ genres: ['Sports'] }, [], 3);
    expect(games[0].igdbId).toBe(3);
  });

  it('uses co-occurrence with selected seed games to rank likely follow-ups first', async () => {
    await mongo.db.collection(COLLECTIONS.gameCooccurrence).insertOne({
      pairKey: '1:3',
      gameA: 1,
      gameB: 3,
      count: 4,
      updatedAt: new Date(),
    });

    const games = await getSuggestions({}, [1], 3, { seedIds: [1] });

    expect(games[0].igdbId).toBe(3);
  });

  it('softly down-ranks games near rejected cards without hard-filtering them', async () => {
    const games = await getSuggestions({}, [6], 5, { rejectIds: [6] });
    const ids = games.map((g) => g.igdbId);

    expect(ids).toContain(7);
    expect(ids.indexOf(7)).toBeGreaterThan(ids.indexOf(1));
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
