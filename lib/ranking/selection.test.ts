import { describe, expect, it } from 'vitest';

import { applyOutcome, createRankingState, nextMatchup, PAIR_BREAK_EVERY } from './index';

describe('ranking selection', () => {
  it('early phase favors group matchups', () => {
    const state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 21 });

    const matchup = nextMatchup(state, 'early');

    expect(matchup?.type).toBe('champion');
    expect(matchup?.gameIds).toHaveLength(5);
  });

  it('early phase yields a two-card breather at the pair-break cadence', () => {
    const state = { ...createRankingState([1, 2, 3, 4], { seed: 22 }), round: PAIR_BREAK_EVERY };

    const matchup = nextMatchup(state, 'early');

    expect(matchup?.gameIds).toHaveLength(2);
    expect(['duel', 'rivalry', 'higher-lower']).toContain(matchup?.type);
  });

  it('late phase targets tier boundary pairs', () => {
    let state = createRankingState([1, 2, 3, 4], { seed: 23 });
    for (let i = 0; i < 16; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 4 });
      state = applyOutcome(state, { type: 'pairwise', winnerId: 2, loserId: 3 });
    }

    const matchup = nextMatchup(state, 'late');

    expect(matchup?.gameIds).toHaveLength(2);
    expect(['promotion', 'higher-lower']).toContain(matchup?.type);
    expect(matchup?.anchorId).toBeDefined();
  });

  it('deprioritizes recently shown games', () => {
    let state = createRankingState([1, 2, 3, 4, 5, 6, 7, 8], { seed: 24 });
    state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 2 });

    const matchup = nextMatchup(state, 'early');

    expect(matchup?.gameIds).not.toContain(1);
    expect(matchup?.gameIds).not.toContain(2);
  });

  it('is deterministic for the same seed and state', () => {
    const a = createRankingState([1, 2, 3, 4, 5], { seed: 25 });
    const b = createRankingState([1, 2, 3, 4, 5], { seed: 25 });

    expect(nextMatchup(a, 'early')).toEqual(nextMatchup(b, 'early'));
  });
});
