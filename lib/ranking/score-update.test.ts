import { describe, expect, it } from 'vitest';

import { applyOutcome, createRankingState, parseRankingState, serializeRankingState } from './index';

describe('ranking score updates', () => {
  it('moves pairwise winner up, loser down, and reduces uncertainty', () => {
    const state = createRankingState([1, 2], { seed: 7 });

    const next = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 2 });

    expect(next).not.toBe(state);
    expect(next.games[1].rating).toBeGreaterThan(state.games[1].rating);
    expect(next.games[2].rating).toBeLessThan(state.games[2].rating);
    expect(next.games[1].uncertainty).toBeLessThan(state.games[1].uncertainty);
    expect(next.games[2].comparisons).toBeGreaterThan(0);
  });

  it('applies lineup ordering as pairwise implications', () => {
    const state = createRankingState([1, 2, 3, 4, 5], { seed: 1 });

    const next = applyOutcome(state, { type: 'lineup', orderedIds: [1, 2, 3, 4, 5] });

    expect(next.games[1].rating).toBeGreaterThan(next.games[3].rating);
    expect(next.games[3].rating).toBeGreaterThan(next.games[5].rating);
    expect(next.games[1].comparisons).toBeGreaterThan(next.games[3].comparisons - 1);
  });

  it('applies pick-k-of-n, champion, and sacrifice outcomes in the expected direction', () => {
    let state = createRankingState([1, 2, 3, 4, 5], { seed: 2 });

    state = applyOutcome(state, { type: 'pick-k-of-n', pickedIds: [1, 2], rejectedIds: [3, 4, 5] });
    expect(state.games[1].rating).toBeGreaterThan(state.games[4].rating);
    expect(state.games[2].rating).toBeGreaterThan(state.games[5].rating);

    state = applyOutcome(state, { type: 'champion', winnerId: 3, opponentIds: [1, 2, 4, 5] });
    expect(state.games[3].rating).toBeGreaterThan(1500);

    state = applyOutcome(state, { type: 'sacrifice', loserId: 2, opponentIds: [1, 3, 4, 5] });
    expect(state.games[2].rating).toBeLessThan(state.games[1].rating);
  });

  it('bucket sort ranks higher buckets above lower ones in a single round', () => {
    const state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 8 });

    const next = applyOutcome(state, {
      type: 'bucket',
      buckets: [
        [1, 2],
        [3, 4],
        [5, 6],
      ],
    });

    // One bucket round costs exactly one round, regardless of how many pairs it implies.
    expect(next.round).toBe(state.round + 1);

    // Every higher-bucket game outranks every lower-bucket game.
    expect(next.games[1].rating).toBeGreaterThan(next.games[3].rating);
    expect(next.games[3].rating).toBeGreaterThan(next.games[5].rating);
    expect(next.games[2].rating).toBeGreaterThan(next.games[6].rating);

    // Same-bucket games stay close relative to the cross-bucket spread, but still gain coverage.
    const withinTop = Math.abs(next.games[1].rating - next.games[2].rating);
    const acrossBuckets = Math.abs(next.games[1].rating - next.games[5].rating);
    expect(withinTop).toBeLessThan(acrossBuckets);
    expect(next.games[1].comparisons).toBeGreaterThan(0);
  });

  it('about-equal pulls separated ratings closer together', () => {
    let state = createRankingState([1, 2], { seed: 3 });
    for (let i = 0; i < 6; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 2 });
    }
    const beforeGap = state.games[1].rating - state.games[2].rating;

    const next = applyOutcome(state, { type: 'about-equal', gameIds: [1, 2] });

    expect(next.games[1].rating - next.games[2].rating).toBeLessThan(beforeGap);
  });

  it('replay is a moderate absolute signal that banks real confidence credit', () => {
    const base = createRankingState([1, 2], { seed: 4 });

    const up = applyOutcome(base, { type: 'replay', gameId: 1, answer: 'immediately' });
    const down = applyOutcome(base, { type: 'replay', gameId: 1, answer: 'never' });

    // Moves the rating toward the answer (up for "immediately", down for "never").
    expect(up.games[1].rating).toBeGreaterThan(base.games[1].rating);
    expect(down.games[1].rating).toBeLessThan(base.games[1].rating);

    // An absolute tier statement banks meaningful confidence credit (more than a single pairwise's
    // worth) and sharpens the estimate, so a replay round registers real progress.
    expect(up.games[1].comparisons).toBeGreaterThan(1);
    expect(up.games[1].uncertainty).toBeLessThan(base.games[1].uncertainty);
  });

  it('vibe verdict moves a game toward the chosen tier band', () => {
    const state = createRankingState([1], { seed: 6 });

    const high = applyOutcome(state, { type: 'vibe', gameId: 1, tier: 'S' });
    const low = applyOutcome(state, { type: 'vibe', gameId: 1, tier: 'F' });

    expect(high.games[1].rating).toBeGreaterThan(state.games[1].rating);
    expect(low.games[1].rating).toBeLessThan(state.games[1].rating);
  });

  it('vibe shrinks uncertainty and counts a comparison', () => {
    const state = createRankingState([1], { seed: 6 });

    const next = applyOutcome(state, { type: 'vibe', gameId: 1, tier: 'C' });

    expect(next.games[1].uncertainty).toBeLessThan(state.games[1].uncertainty);
    expect(next.games[1].comparisons).toBeGreaterThan(state.games[1].comparisons);
  });

  it('vibe is a no-op for an unknown game id', () => {
    const state = createRankingState([1], { seed: 6 });

    const next = applyOutcome(state, { type: 'vibe', gameId: 999, tier: 'S' });

    expect(next.games[1].rating).toBe(state.games[1].rating);
  });

  it('vibe is deterministic for the same input', () => {
    const state = createRankingState([1], { seed: 6 });

    const a = applyOutcome(state, { type: 'vibe', gameId: 1, tier: 'B' });
    const b = applyOutcome(state, { type: 'vibe', gameId: 1, tier: 'B' });

    expect(a).toEqual(b);
  });

  it('serializes and parses the persisted state shape', () => {
    const state = applyOutcome(createRankingState([1, 2], { seed: 5 }), {
      type: 'pairwise',
      winnerId: 1,
      loserId: 2,
    });

    expect(parseRankingState(serializeRankingState(state))).toEqual(state);
    expect(parseRankingState({ version: 999 })).toBeNull();
  });
});

