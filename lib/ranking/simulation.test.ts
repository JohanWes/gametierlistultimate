import { describe, expect, it } from 'vitest';

import { applyOutcome, createRankingState } from './index';

describe('ranking simulation', () => {
  it('converges toward a synthetic true ranking', () => {
    const truth = [1, 2, 3, 4, 5, 6, 7, 8];
    const trueRank = new Map(truth.map((id, index) => [id, index]));
    let state = createRankingState(truth, { seed: 41 });

    for (let pass = 0; pass < 8; pass += 1) {
      for (let i = 0; i < truth.length; i += 1) {
        for (let j = i + 1; j < truth.length; j += 1) {
          const a = truth[(i + pass) % truth.length];
          const b = truth[(j + pass) % truth.length];
          const winnerId = trueRank.get(a)! < trueRank.get(b)! ? a : b;
          const loserId = winnerId === a ? b : a;
          state = applyOutcome(state, { type: 'pairwise', winnerId, loserId });
        }
      }
    }

    const ranked = Object.values(state.games)
      .sort((a, b) => b.rating - a.rating)
      .map((game) => game.gameId);

    expect(ranked.slice(0, 3)).toEqual([1, 2, 3]);
    expect(ranked.indexOf(1)).toBeLessThan(ranked.indexOf(8));
    expect(ranked.indexOf(4)).toBeLessThan(ranked.indexOf(7));
  });
});
