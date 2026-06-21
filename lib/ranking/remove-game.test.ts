import { describe, expect, it } from 'vitest';

import { applyOutcome, createRankingState, removeGameFromState } from './index';

describe('removeGameFromState', () => {
  it('drops the game entry and leaves the others intact', () => {
    const state = createRankingState([1, 2, 3], { seed: 4 });

    const next = removeGameFromState(state, 2);

    expect(next).not.toBe(state);
    expect(next.games['2']).toBeUndefined();
    expect(next.games['1']).toBeDefined();
    expect(next.games['3']).toBeDefined();
    // Original is untouched (immutable).
    expect(state.games['2']).toBeDefined();
  });

  it('strips recent matchups that reference the removed game', () => {
    let state = createRankingState([1, 2, 3], { seed: 4 });
    state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 2 });
    expect(state.recentMatchups.some((m) => m.gameIds.includes(2))).toBe(true);

    const next = removeGameFromState(state, 2);

    expect(next.recentMatchups.some((m) => m.gameIds.includes(2))).toBe(false);
  });

  it('leaves round and seed untouched', () => {
    let state = createRankingState([1, 2, 3], { seed: 9 });
    state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 2 });

    const next = removeGameFromState(state, 3);

    expect(next.round).toBe(state.round);
    expect(next.seed).toBe(state.seed);
  });
});
