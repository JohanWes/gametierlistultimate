import { describe, expect, it } from 'vitest';

import { applyOutcome, computeConfidence, computeTiers, createRankingState } from './index';

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

  // Confidence is now a tier-placement measure: it tracks how cleanly a game's rating sits inside a
  // single tier band, not how many times it was sampled. A game parked on a tier boundary stays
  // uncertain no matter how well-sampled, while a game deep inside a band gets confident quickly.
  it('stays low for a game sitting on a tier boundary even when well-sampled', () => {
    const state = createRankingState([1, 2], { seed: 1 });
    state.games['1'].rating = 1535; // deep inside the B band (1505–1565)
    state.games['1'].comparisons = 12;
    state.games['2'].rating = 1505; // exactly on the B/C boundary
    state.games['2'].comparisons = 12;

    const confidence = computeConfidence(state);

    expect(confidence.perGame['2']).toBeLessThan(60);
    expect(confidence.perGame['1']).toBeGreaterThan(confidence.perGame['2'] + 15);
  });

  it('becomes confident for a clearly-separated game after only a few comparisons', () => {
    const state = createRankingState([1], { seed: 1 });
    state.games['1'].rating = 1535; // mid-B, clear of both boundaries
    state.games['1'].comparisons = 6;

    expect(computeConfidence(state).perGame['1']).toBeGreaterThan(70);
  });

  // computeTiers caps the S tier to ~10% of the pool and displays the overflow in A. Confidence
  // must match the *displayed* tier: a top game whose rating sits in the S band but is shown in A
  // should read as confidently "A or better", not as its (lower) raw P(S) band mass.
  it('keeps confidence honest under the S-tier cap', () => {
    const ids = Array.from({ length: 12 }, (_, i) => i + 1);
    const state = createRankingState(ids, { seed: 1 });
    state.games['1'].rating = 1700;
    state.games['2'].rating = 1690;
    state.games['3'].rating = 1620; // in the S band, but the cap displays it in A
    for (let i = 4; i <= 12; i += 1) state.games[String(i)].rating = 1400 + i;
    for (const id of ids) state.games[String(id)].comparisons = 12;

    const tiers = computeTiers(state);
    expect(tiers.S).not.toContain(3);
    expect(tiers.A).toContain(3);
    expect(computeConfidence(state).perGame['3']).toBeGreaterThan(90);
  });
});

