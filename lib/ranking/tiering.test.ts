import { describe, expect, it } from 'vitest';

import {
  applyOutcome,
  assignTier,
  computeTiers,
  createRankingState,
  parseRankingState,
  serializeRankingState,
} from './index';

describe('ranking tiering', () => {
  it('maps clear score separation into ordered tiers and permits empty tiers', () => {
    let state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 31 });
    for (let i = 0; i < 28; i += 1) {
      state = applyOutcome(state, { type: 'lineup', orderedIds: [1, 2, 3, 4, 5, 6] });
    }

    const tiers = computeTiers(state);

    expect(tiers.S).toContain(1);
    // Aggressive spreading can lift the runner-up into S as well — assert it lands high, not its exact tier.
    expect(tiers.S.concat(tiers.A, tiers.B, tiers.C)).toContain(2);
    expect(tiers.E.concat(tiers.F)).toContain(6);
    expect(Object.values(tiers).some((games) => games.length === 0)).toBe(true);
  });

  it('keeps S-tier small for larger pools', () => {
    let state = createRankingState(Array.from({ length: 20 }, (_, i) => i + 1), { seed: 32 });
    for (let i = 0; i < 22; i += 1) {
      state = applyOutcome(state, {
        type: 'lineup',
        orderedIds: Array.from({ length: 20 }, (_, j) => j + 1).slice(0, 5),
      });
    }

    expect(computeTiers(state).S.length).toBeLessThanOrEqual(2);
  });

  it('does not let IGDB priors override strong user signal', () => {
    let state = createRankingState(
      [
        { gameId: 1, rating: 40, popularity: 10 },
        { gameId: 2, rating: 98, popularity: 100 },
      ],
      { seed: 33 },
    );

    expect(state.games[2].rating).toBeGreaterThan(state.games[1].rating);

    for (let i = 0; i < 12; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 2 });
    }

    const tiers = computeTiers(state);
    const flat = [...tiers.S, ...tiers.A, ...tiers.B, ...tiers.C, ...tiers.D, ...tiers.E, ...tiers.F];
    expect(flat.indexOf(1)).toBeLessThan(flat.indexOf(2));
  });

  it('assignTier pins a game to the chosen tier through recompute and reload', () => {
    // 12 games so the S cap (top 2) applies; games 1 and 2 are pushed deep into S, above the
    // flat S band a manual move sets, so without a pin the moved game would be demoted to A.
    const ids = Array.from({ length: 12 }, (_, i) => i + 1);
    let state = createRankingState(ids, { seed: 7 });
    for (let i = 0; i < 10; i += 1) {
      state = applyOutcome(state, {
        type: 'bucket',
        buckets: [ids.slice(0, 2), ids.slice(2, 10), ids.slice(10)],
      });
    }
    expect(computeTiers(state).S).toEqual([1, 2]);

    let moved = assignTier(state, 5, 'S');
    moved = assignTier(moved, 11, 'B');

    const reloaded = parseRankingState(JSON.parse(JSON.stringify(serializeRankingState(moved))))!;
    const tiers = computeTiers(reloaded);
    expect(tiers.S).toEqual([1, 2, 5]);
    expect(tiers.B).toContain(11);

    // Playing another round releases the pin; the engine's rating takes over again.
    const played = applyOutcome(reloaded, { type: 'pairwise', winnerId: 6, loserId: 5 });
    expect(played.games[5].manual).toBeUndefined();
  });

  it('assignTier leaves the state untouched for an unknown game', () => {
    const state = createRankingState([1, 2], { seed: 9 });
    expect(assignTier(state, 999, 'S')).toBe(state);
  });
});

