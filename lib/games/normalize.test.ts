import { describe, expect, it } from 'vitest';

import { igdbCoverUrl, isDlc, normalizeIgdb, normalizeMongoDoc } from './normalize';

describe('normalizeMongoDoc', () => {
  const doc = {
    _id: '699f0cc78b8406709c7f9923',
    id: 1942,
    name: 'The Witcher 3: Wild Hunt',
    year: 2015,
    platform: 'PC (Microsoft Windows)',
    genre: 'Role-playing (RPG)',
    rating: 92,
    cover: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg',
    synopsis: 'A story-driven open world RPG.',
  };

  it('maps the real Mongo fields to the Game shape', () => {
    const game = normalizeMongoDoc(doc);
    expect(game).toEqual({
      igdbId: 1942,
      title: 'The Witcher 3: Wild Hunt',
      coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg',
      genres: ['Role-playing (RPG)'],
      platforms: ['PC (Microsoft Windows)'],
      releaseYear: 2015,
      popularity: null,
      rating: 92,
      summary: 'A story-driven open world RPG.',
      hasCover: true,
      category: null,
    });
  });

  it('derives hasCover=false when cover is missing', () => {
    const game = normalizeMongoDoc({ ...doc, cover: '' });
    expect(game.hasCover).toBe(false);
    expect(game.coverUrl).toBeNull();
  });

  it('handles array-valued genre/platform too', () => {
    const game = normalizeMongoDoc({ ...doc, genre: ['RPG', 'Adventure'], platform: ['PC', 'PS4'] });
    expect(game.genres).toEqual(['RPG', 'Adventure']);
    expect(game.platforms).toEqual(['PC', 'PS4']);
  });

  it('falls back to the `summary` field when `synopsis` is absent (IGDB-upserted docs)', () => {
    const { synopsis: _omit, ...docWithoutSynopsis } = doc;
    void _omit;
    const game = normalizeMongoDoc({ ...docWithoutSynopsis, summary: 'From IGDB upsert.' });
    expect(game.summary).toBe('From IGDB upsert.');
  });

  it('prefers `synopsis` over `summary` when both are present (legacy docs win)', () => {
    const game = normalizeMongoDoc({ ...doc, summary: 'should be ignored' });
    expect(game.summary).toBe('A story-driven open world RPG.');
  });

  it('returns null summary when neither field is present', () => {
    const { synopsis: _omit, ...docWithoutSynopsis } = doc;
    void _omit;
    const game = normalizeMongoDoc(docWithoutSynopsis);
    expect(game.summary).toBeNull();
  });
});

describe('normalizeIgdb', () => {
  const raw = {
    id: 1942,
    name: 'The Witcher 3: Wild Hunt',
    cover: { image_id: 'coaarl' },
    genres: [{ name: 'Role-playing (RPG)' }, { name: 'Adventure' }],
    platforms: [{ name: 'PC (Microsoft Windows)' }],
    first_release_date: 1431993600, // 2015-05-19 UTC
    rating: 91.7,
    total_rating_count: 1500,
    summary: 'A story-driven open world RPG.',
    category: 0,
  };

  it('maps a raw IGDB response and resolves the cover URL', () => {
    const game = normalizeIgdb(raw);
    expect(game.igdbId).toBe(1942);
    expect(game.coverUrl).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/coaarl.jpg');
    expect(game.genres).toEqual(['Role-playing (RPG)', 'Adventure']);
    expect(game.platforms).toEqual(['PC (Microsoft Windows)']);
    expect(game.releaseYear).toBe(2015);
    expect(game.rating).toBe(92); // rounded
    expect(game.popularity).toBe(1500);
    expect(game.hasCover).toBe(true);
  });

  it('handles a missing cover', () => {
    const game = normalizeIgdb({ id: 5, name: 'No Cover' });
    expect(game.coverUrl).toBeNull();
    expect(game.hasCover).toBe(false);
  });

  it('flags DLC categories', () => {
    expect(isDlc(normalizeIgdb({ ...raw, category: 1 }))).toBe(true); // DLC
    expect(isDlc(normalizeIgdb({ ...raw, category: 2 }))).toBe(true); // expansion
    expect(isDlc(normalizeIgdb({ ...raw, category: 0 }))).toBe(false); // main game
    expect(isDlc(normalizeMongoDoc({ id: 1, name: 'x' }))).toBe(false); // no category field
  });
});

describe('igdbCoverUrl', () => {
  it('returns null for missing image id', () => {
    expect(igdbCoverUrl(undefined)).toBeNull();
    expect(igdbCoverUrl('abc')).toContain('/t_cover_big/abc.jpg');
  });
});
