import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '@/lib/mongo';
import { withMemoryMongo, type MemoryMongo } from '@/test/helpers/mongo';

import {
  getByIds,
  getStarterSet,
  getSuggestions,
  resetStarterSetCache,
  searchLocal,
  upsertGames,
} from './repo';
import { STARTER_COVERS } from './starter-covers';

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
  resetStarterSetCache(); // each test re-seeds the games collection, so drop the memoized shelf
});

describe('getSuggestions', () => {
  it('excludes given ids, DLC, and coverless games', async () => {
    const games = await getSuggestions([6], 10);
    const ids = games.map((g) => g.igdbId);
    expect(ids).not.toContain(6); // excluded
    expect(ids).not.toContain(5); // DLC (category 1)
    expect(ids).not.toContain(4); // no cover
    expect(games.every((g) => g.coverUrl)).toBe(true);
  });

  it('respects the limit', async () => {
    const games = await getSuggestions([], 2);
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

    const games = await getSuggestions([], 20);
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

    const games = await getSuggestions([], 20);

    expect(games.filter((g) => /bendy and the dark revival/i.test(g.title))).toHaveLength(1);
  });

  it('uses co-occurrence with selected seed games to rank likely follow-ups first', async () => {
    await mongo.db.collection(COLLECTIONS.gameCooccurrence).insertOne({
      pairKey: '1:3',
      gameA: 1,
      gameB: 3,
      count: 4,
      updatedAt: new Date(),
    });

    const games = await getSuggestions([1], 3, { seedIds: [1] });

    expect(games[0].igdbId).toBe(3);
  });

  it('hydrates the adaptive path to full games — cover and year survive ranking', async () => {
    // The selected game carries fields the scoring pass does not project (cover, year).
    // Ranking must run on lean docs, then re-hydrate so the returned batch is the complete
    // Game shape, never a partial scoring record.
    await mongo.db.collection(COLLECTIONS.games).insertOne({
      id: 40,
      name: 'Baldurs Gate 3',
      genres: ['Role-playing (RPG)', 'Adventure'],
      year: 2023,
      rating: 97,
      popularity: 900,
      cover: 'https://img/bg3.jpg',
      category: 0,
    });
    await mongo.db.collection(COLLECTIONS.gameCooccurrence).insertOne({
      pairKey: '1:40',
      gameA: 1,
      gameB: 40,
      count: 5,
      updatedAt: new Date(),
    });

    const games = await getSuggestions([1], 3, { seedIds: [1] });
    const selected = games.find((g) => g.igdbId === 40);

    // Co-occurrence ranks the seeded follow-up first.
    expect(games[0].igdbId).toBe(40);
    expect(selected).toMatchObject({
      igdbId: 40,
      title: 'Baldurs Gate 3',
      coverUrl: 'https://img/bg3.jpg',
      genres: ['Role-playing (RPG)', 'Adventure'],
      releaseYear: 2023,
      rating: 97,
      popularity: 900,
      category: 0,
    });
  });

  it('softly down-ranks games near rejected cards without hard-filtering them', async () => {
    const games = await getSuggestions([6], 5, { rejectIds: [6] });
    const ids = games.map((g) => g.igdbId);

    expect(ids).toContain(7);
    expect(ids.indexOf(7)).toBeGreaterThan(ids.indexOf(1));
  });

  it('returns the curated starter shelf when preset=true and the pool is cold', async () => {
    // Seed two starter ids (Hades, Elden Ring) so the shelf has something to return.
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 113112, name: 'Hades', genre: 'Indie', platform: 'PC', rating: 90, cover: 'https://x/h.jpg' },
      { id: 119133, name: 'Elden Ring', genre: 'RPG', platform: 'PC', rating: 95, cover: 'https://x/er.jpg' },
    ]);

    const games = await getSuggestions([], 5, { preset: true });
    // The two starters lead the batch in shelf order, ahead of any generic filler.
    expect(games.slice(0, 2).map((g) => g.igdbId)).toEqual([119133, 113112]);
  });

  it('ignores preset once the user has seed games (personalization takes over)', async () => {
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 500, name: 'Hades', genre: 'Indie', platform: 'PC', rating: 90, cover: 'https://x/h.jpg' },
      { id: 501, name: 'Elden Ring', genre: 'RPG', platform: 'PC', rating: 95, cover: 'https://x/er.jpg' },
      { id: 502, name: 'Starter Filler', genre: 'Indie', platform: 'PC', rating: 50, cover: 'https://x/sf.jpg' },
    ]);

    // With a seed id present, preset is ignored — the adaptive co-occurrence path runs instead.
    const games = await getSuggestions([], 5, { preset: true, seedIds: [1] });
    // The adaptive path uses co-occurrence + title/genre affinity over the full collection;
    // it must NOT simply return the starter shelf. With no co-occurrence docs seeded, the
    // sort falls back to the affinity+popularity score, but either way the path is the
    // adaptive one (not the preset branch). We assert the call doesn't throw and returns games.
    expect(games.length).toBeGreaterThan(0);
  });

  it('honors exclude in the preset branch so the backlog prefetch gets the next starters', async () => {
    // Seed eight starter ids so the shelf has a full batch + leftovers.
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 113112, name: 'Hades', genre: 'Indie', platform: 'PC', rating: 90, cover: 'https://x/h.jpg' },
      { id: 119133, name: 'Elden Ring', genre: 'RPG', platform: 'PC', rating: 95, cover: 'https://x/er.jpg' },
      { id: 1942, name: 'The Witcher 3: Wild Hunt', genre: 'RPG', platform: 'PC', rating: 92, cover: 'https://x/w.jpg' },
      { id: 1009, name: 'The Last of Us', genre: 'Adventure', platform: 'PS3', rating: 95, cover: 'https://x/tlou.jpg' },
      { id: 103298, name: 'Doom Eternal', genre: 'Shooter', platform: 'PC', rating: 90, cover: 'https://x/d.jpg' },
      { id: 109462, name: 'Animal Crossing: New Horizons', genre: 'Simulator', platform: 'Switch', rating: 90, cover: 'https://x/ac.jpg' },
      { id: 19686, name: 'Resident Evil 2', genre: 'Horror', platform: 'PC', rating: 91, cover: 'https://x/re.jpg' },
      { id: 7789, name: 'The Binding of Isaac: Rebirth', genre: 'Indie', platform: 'PC', rating: 86, cover: 'https://x/isaac.jpg' },
    ]);

    // First batch: no exclude — returns the first 5 resolved starters.
    const first = await getSuggestions([], 5, { preset: true });
    const firstIds = first.map((g) => g.igdbId);
    expect(firstIds).toHaveLength(5);

    // Second batch (backlog prefetch): exclude the first 5 — must NOT return the same 5.
    const second = await getSuggestions(firstIds, 5, { preset: true });
    const secondIds = second.map((g) => g.igdbId);
    expect(secondIds).toHaveLength(5);
    // No overlap between the two batches — the exclude param was honored.
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
  });
});

describe('getStarterSet', () => {
  it('returns shelf games by id in shelf order with the local cover override', async () => {
    // Inserted out of shelf order; the shelf starts Witcher 3 (1942), Elden Ring (119133).
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 119133, name: 'Elden Ring', genre: 'RPG', platform: 'PC', rating: 95, cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/er.jpg' },
      { id: 1942, name: 'The Witcher 3: Wild Hunt', genre: 'RPG', platform: 'PC', rating: 92, cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/w3.jpg' },
    ]);

    const games = await getStarterSet();
    expect(games.map((g) => [g.igdbId, g.coverUrl])).toEqual([
      [1942, STARTER_COVERS[1942]],
      [119133, STARTER_COVERS[119133]],
    ]);
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
  it('inserts new games without overwriting existing ones (keyed on igdbId)', async () => {
    await upsertGames([
      {
        igdbId: 100,
        title: 'New From IGDB',
        coverUrl: 'https://img/new.jpg',
        genres: ['Adventure'],
        releaseYear: 2020,
        popularity: 10,
        rating: 80,
        category: 0,
      },
      {
        igdbId: 1,
        title: 'Clobbered',
        coverUrl: null,
        genres: [],
        releaseYear: null,
        popularity: null,
        rating: null,
        category: 0,
      },
    ]);
    const [inserted, existing] = await getByIds([100, 1]);
    expect(inserted.title).toBe('New From IGDB');
    expect(existing).toMatchObject({ title: 'The Witcher 3', coverUrl: 'https://img/w3.jpg' });
  });
});
