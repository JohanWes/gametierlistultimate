import { describe, expect, it } from 'vitest';

import {
  STARTER_ENTRIES,
  STARTER_GAME_NAMES,
  getStarterSetIds,
  setResolvedStarterIds,
} from './starter-set';

describe('STARTER_ENTRIES / STARTER_GAME_NAMES', () => {
  it('has 36 curated games across 13 categories', () => {
    expect(STARTER_ENTRIES).toHaveLength(36);
    expect(STARTER_GAME_NAMES).toHaveLength(36);

    const categories = new Set(STARTER_ENTRIES.map((e) => e.category));
    expect(categories.size).toBe(13);
  });

  it('has no duplicate names', () => {
    const names = STARTER_GAME_NAMES.map((n) => n.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('has no two same-category games within any window of 5 consecutive positions', () => {
    // Every 5-card batch must be fully diverse — the core shelf UX invariant.
    for (let i = 0; i < STARTER_ENTRIES.length; i += 1) {
      const windowStart = Math.max(0, i - 4);
      const window = STARTER_ENTRIES.slice(windowStart, i + 1);
      const cats = window.map((e) => e.category);
      // The game at position i must not share a category with any of the previous 4.
      expect(new Set(cats).size, `position ${i} (${STARTER_ENTRIES[i].category})`).toBe(cats.length);
    }
  });

  it('each category has between 2 and 3 games', () => {
    const counts = new Map<string, number>();
    for (const e of STARTER_ENTRIES) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    for (const [cat, count] of counts) {
      expect(count, `${cat} should have 2-3 games`).toBeGreaterThanOrEqual(2);
      expect(count, `${cat} should have 2-3 games`).toBeLessThanOrEqual(3);
    }
  });

  it('STARTER_GAME_NAMES is the names view of STARTER_ENTRIES in the same order', () => {
    expect(STARTER_GAME_NAMES).toEqual(STARTER_ENTRIES.map((e) => e.name));
  });
});

describe('resolved starter id cache', () => {
  it('is empty until setResolvedStarterIds is called', () => {
    setResolvedStarterIds([]);
    expect(getStarterSetIds().size).toBe(0);
  });

  it('reflects the ids passed to setResolvedStarterIds, ignoring non-finite values', () => {
    setResolvedStarterIds([1, 2, Number.NaN, 3, Number.POSITIVE_INFINITY]);
    expect([...getStarterSetIds()].sort()).toEqual([1, 2, 3]);
  });

  it('replaces the previous cache rather than appending', () => {
    setResolvedStarterIds([1, 2, 3]);
    setResolvedStarterIds([10, 20]);
    expect([...getStarterSetIds()].sort()).toEqual([10, 20]);
  });
});
