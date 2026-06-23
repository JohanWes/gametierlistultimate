import { describe, expect, it } from 'vitest';

import {
  activeBout,
  boutsForRound,
  championId,
  createTournament,
  pickWinner,
  SHOWDOWN_WEIGHTS,
  TOTAL_BOUTS,
  toOutcomes,
  type TournamentState,
} from './tournament';

const SEED = [1, 2, 3, 4, 5, 6, 7, 8];

/** Play the whole tournament, always crowning the active bout's first slot (`a`). */
function playAllPickingA(start: TournamentState): TournamentState {
  let state = start;
  for (let guard = 0; guard < 20 && !state.done; guard += 1) {
    const bout = activeBout(state)!;
    state = pickWinner(state, bout.a);
  }
  return state;
}

describe('great-showdown tournament', () => {
  it('seeds four quarterfinals from the eight ids in pair order', () => {
    const state = createTournament(SEED);
    const qf = boutsForRound(state, 'QF');
    expect(qf.map((b) => [b.a, b.b])).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ]);
    expect(activeBout(state)!.id).toBe('QF1');
  });

  it('plays nine bouts and crowns a champion', () => {
    const final = playAllPickingA(createTournament(SEED));
    expect(final.done).toBe(true);
    expect(final.bouts).toHaveLength(TOTAL_BOUTS);
    expect(championId(final)).toBe(1);
    expect(activeBout(final)).toBeNull();
  });

  it('pairs the first-round losers into the redemption duels', () => {
    const final = playAllPickingA(createTournament(SEED));
    const redemption = boutsForRound(final, 'redemption');
    // Picking `a` everywhere makes the QF losers 2, 4, 6, 8.
    expect(redemption.map((b) => [b.a, b.b])).toEqual([
      [2, 4],
      [6, 8],
    ]);
  });

  it('emits one weighted pairwise outcome per bout, escalating by depth', () => {
    const outcomes = toOutcomes(playAllPickingA(createTournament(SEED)));
    expect(outcomes).toEqual([
      { type: 'pairwise', winnerId: 1, loserId: 2, weight: SHOWDOWN_WEIGHTS.QF },
      { type: 'pairwise', winnerId: 3, loserId: 4, weight: SHOWDOWN_WEIGHTS.QF },
      { type: 'pairwise', winnerId: 5, loserId: 6, weight: SHOWDOWN_WEIGHTS.QF },
      { type: 'pairwise', winnerId: 7, loserId: 8, weight: SHOWDOWN_WEIGHTS.QF },
      { type: 'pairwise', winnerId: 2, loserId: 4, weight: SHOWDOWN_WEIGHTS.redemption },
      { type: 'pairwise', winnerId: 6, loserId: 8, weight: SHOWDOWN_WEIGHTS.redemption },
      { type: 'pairwise', winnerId: 1, loserId: 3, weight: SHOWDOWN_WEIGHTS.SF },
      { type: 'pairwise', winnerId: 5, loserId: 7, weight: SHOWDOWN_WEIGHTS.SF },
      { type: 'pairwise', winnerId: 1, loserId: 5, weight: SHOWDOWN_WEIGHTS.finale },
    ]);
  });

  it('gives every game at least two comparisons', () => {
    const outcomes = toOutcomes(playAllPickingA(createTournament(SEED)));
    const seen = new Map<number, number>();
    for (const o of outcomes) {
      if (o.type !== 'pairwise') continue;
      seen.set(o.winnerId, (seen.get(o.winnerId) ?? 0) + 1);
      seen.set(o.loserId, (seen.get(o.loserId) ?? 0) + 1);
    }
    for (const id of SEED) expect(seen.get(id) ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('ignores a winner that is not in the active bout', () => {
    const state = createTournament(SEED);
    expect(pickWinner(state, 999)).toBe(state);
  });
});
