import { describe, expect, it } from 'vitest';

import { applyOutcome, computeConfidence, computeTiers, createRankingState } from './index';

/**
 * Guards the headline goal of the aggressiveness pass: a decisive player should fill the extreme
 * tiers and reach high confidence in a handful of rounds — not hundreds — with no game stranded in
 * the middle just because the bumps were too timid.
 */
describe('ranking aggressiveness', () => {
  it('fills S and F and reaches high confidence within a handful of bucket rounds', () => {
    const ids = Array.from({ length: 12 }, (_, i) => i + 1); // 1 (best) … 12 (worst)
    let state = createRankingState(ids, { seed: 5 });

    // A decisive player sorts the field into top / middle / bottom every round.
    for (let round = 0; round < 8; round += 1) {
      state = applyOutcome(state, {
        type: 'bucket',
        buckets: [ids.slice(0, 4), ids.slice(4, 8), ids.slice(8, 12)],
      });
    }

    const tiers = computeTiers(state);
    expect(tiers.S.length).toBeGreaterThan(0);
    expect(tiers.F.length).toBeGreaterThan(0);
    expect(computeConfidence(state).global).toBeGreaterThanOrEqual(80);
    expect(state.round).toBeLessThanOrEqual(8);
  });

  it('separates S from F decisively after a single bucket round', () => {
    const state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 9 });

    // One round of sorting already opens a wide rating gap between the top and bottom buckets.
    const next = applyOutcome(state, {
      type: 'bucket',
      buckets: [[1], [2, 3, 4, 5], [6]],
    });

    expect(next.games[1].rating - next.games[6].rating).toBeGreaterThan(80);
  });
});
