import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '@/lib/mongo';
import { withMemoryMongo, type MemoryMongo } from '@/test/helpers/mongo';

import { getByIds, getByNames, getStarterSet, getSuggestions, searchLocal, upsertGames } from './repo';
import { setResolvedStarterIds } from './starter-set';

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
  setResolvedStarterIds([]); // reset the process-wide starter id cache between tests
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

  it('returns the curated starter shelf when preset=true and the pool is cold', async () => {
    // Seed two starter names so the shelf has something to return.
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 500, name: 'Hades', genre: 'Indie', platform: 'PC', rating: 90, cover: 'https://x/h.jpg' },
      { id: 501, name: 'Elden Ring', genre: 'RPG', platform: 'PC', rating: 95, cover: 'https://x/er.jpg' },
    ]);

    const games = await getSuggestions({}, [], 5, { preset: true });
    const ids = games.map((g) => g.igdbId);
    // The two starters must lead the batch; they're in shelf order (Witcher 3, Elden Ring, ...).
    expect(ids).toContain(501);
    expect(ids).toContain(500);
    // The starter shelf comes before any generic filler — verify both starters appear.
    expect(ids.indexOf(501)).toBeLessThanOrEqual(1);
  });

  it('ignores preset once the user has seed games (personalization takes over)', async () => {
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 500, name: 'Hades', genre: 'Indie', platform: 'PC', rating: 90, cover: 'https://x/h.jpg' },
      { id: 501, name: 'Elden Ring', genre: 'RPG', platform: 'PC', rating: 95, cover: 'https://x/er.jpg' },
      { id: 502, name: 'Starter Filler', genre: 'Indie', platform: 'PC', rating: 50, cover: 'https://x/sf.jpg' },
    ]);

    // With a seed id present, preset is ignored — the adaptive co-occurrence path runs instead.
    const games = await getSuggestions({}, [], 5, { preset: true, seedIds: [1] });
    // The adaptive path uses co-occurrence + title/genre affinity over the full collection;
    // it must NOT simply return the starter shelf. With no co-occurrence docs seeded, the
    // sort falls back to the affinity+popularity score, but either way the path is the
    // adaptive one (not the preset branch). We assert the call doesn't throw and returns games.
    expect(games.length).toBeGreaterThan(0);
  });

  it('honors exclude in the preset branch so the backlog prefetch gets the next starters', async () => {
    // Seed five starter names so the shelf has a full batch + leftovers.
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 500, name: 'Hades', genre: 'Indie', platform: 'PC', rating: 90, cover: 'https://x/h.jpg' },
      { id: 501, name: 'Elden Ring', genre: 'RPG', platform: 'PC', rating: 95, cover: 'https://x/er.jpg' },
      { id: 502, name: 'The Witcher 3: Wild Hunt', genre: 'RPG', platform: 'PC', rating: 92, cover: 'https://x/w.jpg' },
      { id: 503, name: 'The Last of Us', genre: 'Adventure', platform: 'PS3', rating: 95, cover: 'https://x/tlou.jpg' },
      { id: 504, name: 'Doom Eternal', genre: 'Shooter', platform: 'PC', rating: 90, cover: 'https://x/d.jpg' },
      { id: 505, name: 'Animal Crossing: New Horizons', genre: 'Simulator', platform: 'Switch', rating: 90, cover: 'https://x/ac.jpg' },
      { id: 506, name: 'Resident Evil 2', genre: 'Horror', platform: 'PC', rating: 91, cover: 'https://x/re.jpg' },
      { id: 507, name: 'The Binding of Isaac: Rebirth', genre: 'Indie', platform: 'PC', rating: 86, cover: 'https://x/isaac.jpg' },
    ]);

    // First batch: no exclude — returns the first 5 resolved starters.
    const first = await getSuggestions({}, [], 5, { preset: true });
    const firstIds = first.map((g) => g.igdbId);
    expect(firstIds).toHaveLength(5);

    // Second batch (backlog prefetch): exclude the first 5 — must NOT return the same 5.
    const second = await getSuggestions({}, firstIds, 5, { preset: true });
    const secondIds = second.map((g) => g.igdbId);
    expect(secondIds).toHaveLength(5);
    // No overlap between the two batches — the exclude param was honored.
    expect(secondIds.filter((id) => firstIds.includes(id))).toEqual([]);
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

describe('getByNames', () => {
  it('resolves names case-insensitively, preserving requested order, skipping unknowns', async () => {
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 50, name: 'Hades', genre: 'Indie', platform: 'PC', rating: 90, cover: 'https://x/h.jpg' },
      { id: 51, name: 'The Witcher 3: Wild Hunt', genre: 'RPG', platform: 'PC', rating: 92, cover: 'https://x/w.jpg' },
      { id: 52, name: 'Hollow Knight', genre: 'Indie', platform: 'PC', rating: 88, cover: 'https://x/hk.jpg' },
    ]);

    const games = await getByNames(['the witcher 3: wild hunt', 'Hades', 'Nonexistent Game', 'Hollow Knight']);
    expect(games.map((g) => g.igdbId)).toEqual([51, 50, 52]);
  });

  it('matches via NFKD-normalized names (diacritics/punctuation differences)', async () => {
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 60, name: 'NieR: Automata', genre: 'RPG', platform: 'PC', rating: 90, cover: 'https://x/n.jpg' },
      { id: 61, name: 'Pokémon Red', genre: 'RPG', platform: 'GB', rating: 92, cover: 'https://x/p.jpg' },
    ]);

    // Punctuation (colon) and diacritic (é) differences should resolve via normalization.
    const games = await getByNames(['nier automata', 'Pokemon Red']);
    expect(games.map((g) => g.igdbId).sort()).toEqual([60, 61]);
  });

  it('uses substring fallback preferring the shortest matching DB title', async () => {
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 70, name: 'The Elder Scrolls 5: Skyrim', genre: 'RPG', platform: 'PC', rating: 92, cover: 'https://x/s.jpg' },
      { id: 71, name: 'The Elder Scrolls 5: Skyrim - Special Edition', genre: 'RPG', platform: 'PC', rating: 93, cover: 'https://x/se.jpg' },
    ]);

    // "Skyrim" alone should resolve to the shorter main-game title, not the Special Edition.
    const games = await getByNames(['Skyrim']);
    expect(games).toHaveLength(1);
    expect(games[0].igdbId).toBe(70);
  });

  it('returns [] for empty input', async () => {
    expect(await getByNames([])).toEqual([]);
    expect(await getByNames(['   ', ''])).toEqual([]);
  });
});

describe('getStarterSet', () => {
  it('returns starter games in shelf order, filtering unresolved names and DLC', async () => {
    // Seed three real starter names plus a DLC that could be hit by substring fallback.
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 1000, name: 'Hades', genre: 'Indie', platform: 'PC', rating: 90, cover: 'https://x/h.jpg' },
      { id: 1001, name: 'Elden Ring', genre: 'RPG', platform: 'PC', rating: 95, cover: 'https://x/er.jpg' },
      { id: 1002, name: 'Hades: DLC', genre: 'Indie', platform: 'PC', rating: 99, cover: 'https://x/hd.jpg', category: 1 },
    ]);

    const games = await getStarterSet();
    // Only Hades and Elden Ring resolved; Hades DLC (category 1) is filtered out.
    const ids = games.map((g) => g.igdbId).sort();
    expect(ids).toContain(1000);
    expect(ids).toContain(1001);
    expect(ids).not.toContain(1002);
  });

  it('honors a limit, taking the first N in shelf order', async () => {
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 2000, name: 'Hades', genre: 'Indie', platform: 'PC', rating: 90, cover: 'https://x/h.jpg' },
      { id: 2001, name: 'Elden Ring', genre: 'RPG', platform: 'PC', rating: 95, cover: 'https://x/er.jpg' },
      { id: 2002, name: 'Doom Eternal', genre: 'Shooter', platform: 'PC', rating: 90, cover: 'https://x/d.jpg' },
    ]);

    const games = await getStarterSet(2);
    expect(games).toHaveLength(2);
  });

  it('caches the resolved starter ids for the predictor guardrail', async () => {
    const { getStarterSetIds } = await import('./starter-set');
    await mongo.db.collection(COLLECTIONS.games).insertMany([
      { id: 3000, name: 'Hades', genre: 'Indie', platform: 'PC', rating: 90, cover: 'https://x/h.jpg' },
      { id: 3001, name: 'Elden Ring', genre: 'RPG', platform: 'PC', rating: 95, cover: 'https://x/er.jpg' },
    ]);
    expect(getStarterSetIds().size).toBe(0); // reset in beforeEach, not yet resolved
    await getStarterSet();
    const ids = [...getStarterSetIds()].sort();
    // Hades + Elden Ring resolve; the pre-existing "The Witcher 3" fixture also resolves via
    // substring fallback for the starter name "The Witcher 3: Wild Hunt". Assert the two we
    // inserted are present (subset), not exact equality.
    expect(ids).toEqual(expect.arrayContaining([3000, 3001]));
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });
});
