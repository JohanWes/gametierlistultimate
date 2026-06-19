import { describe, expect, it } from 'vitest';

import { applyOutcome, computeConfidence, createRankingState } from './index';

describe('ranking confidence', () => {
  it('starts low and rises as comparisons accumulate', () => {
    let state = createRankingState([1, 2, 3, 4], { seed: 11 });
    const initial = computeConfidence(state).global;

    for (let i = 0; i < 8; i += 1) {
      state = applyOutcome(state, {
        type: 'lineup',
        orderedIds: i % 2 === 0 ? [1, 2, 3, 4] : [2, 1, 4, 3],
      });
    }

    expect(initial).toBe(0);
    expect(computeConfidence(state).global).toBeGreaterThan(initial);
  });

  it('keeps global confidence low when a game is sparse', () => {
    let state = createRankingState([1, 2, 3], { seed: 12 });
    for (let i = 0; i < 12; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 2 });
    }

    const confidence = computeConfidence(state);

    expect(confidence.perGame[1]).toBeGreaterThan(40);
    expect(confidence.perGame[3]).toBe(0);
    expect(confidence.global).toBeLessThan(60);
  });
});

