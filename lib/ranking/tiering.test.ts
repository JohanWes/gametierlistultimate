import { describe, expect, it } from 'vitest';

import { applyOutcome, computeTiers, createRankingState } from './index';

describe('ranking tiering', () => {
  it('maps clear score separation into ordered tiers and permits empty tiers', () => {
    let state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 31 });
    for (let i = 0; i < 28; i += 1) {
      state = applyOutcome(state, { type: 'lineup', orderedIds: [1, 2, 3, 4, 5, 6] });
    }

    const tiers = computeTiers(state);

    expect(tiers.S).toContain(1);
    expect(tiers.A.concat(tiers.B, tiers.C)).toContain(2);
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
});

