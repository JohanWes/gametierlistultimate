import { describe, expect, it } from 'vitest';

import { STARTER_GAME_NAMES } from '@/lib/games/starter-set';

import { ATTRACT_COVER_TITLES } from './AttractCabinet';

/** Normalize to a comparable key: lowercase alphanumerics only (drops punctuation/edition suffixes). */
const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

describe('AttractCabinet covers', () => {
  it('never reuses a starter-shelf game (front page must not repeat the pool builder)', () => {
    const starter = new Set(STARTER_GAME_NAMES.map(key));
    const overlap = ATTRACT_COVER_TITLES.filter((title) => starter.has(key(title)));
    expect(overlap).toEqual([]);
  });

  it('has no duplicate covers', () => {
    expect(new Set(ATTRACT_COVER_TITLES).size).toBe(ATTRACT_COVER_TITLES.length);
  });
});
