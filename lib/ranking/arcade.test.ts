import { describe, expect, it } from 'vitest';

import {
  buildGauntlet,
  canReveal,
  derivePhase,
  REVEAL_MIN_CONFIDENCE,
  REVEAL_MIN_ROUNDS,
  selectRound,
  type MinigameKind,
} from './arcade';
import { applyOutcome, createRankingState, type RankingState } from './index';

const FIVE_GROUP: MinigameKind[] = ['champion', 'sacrifice', 'keep2kill3', 'lineup'];
const PAIR_KINDS: MinigameKind[] = ['duel', 'rivalry', 'higher-lower', 'promotion'];

/** Build a state at a specific round so we can target the engine's round-driven cycles. */
function stateAtRound(ids: number[], round: number, seed = 7): RankingState {
  return { ...createRankingState(ids, { seed }), round };
}

describe('derivePhase', () => {
  it('stays early for the first few rounds regardless of confidence', () => {
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 2);
    expect(derivePhase(state, 90)).toBe('early');
  });

  it('moves through middle and late as confidence climbs', () => {
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 10);
    expect(derivePhase(state, 20)).toBe('early');
    expect(derivePhase(state, 50)).toBe('middle');
    expect(derivePhase(state, 80)).toBe('late');
  });
});

describe('selectRound — phase matching', () => {
  it('early phase yields a five-card group minigame', () => {
    const round = selectRound(createRankingState([1, 2, 3, 4, 5, 6]), { phase: 'early' });
    expect(round).not.toBeNull();
    expect(FIVE_GROUP).toContain(round!.kind);
    expect(round!.gameIds).toHaveLength(5);
  });

  it('middle phase yields a two-card pair minigame', () => {
    let state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 3 });
    // 14 rounds — clear of the replay (every 6) and gauntlet (every 8) injection schedule.
    for (let i = 0; i < 7; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 6 });
      state = applyOutcome(state, { type: 'pairwise', winnerId: 2, loserId: 5 });
    }
    const round = selectRound(state, { phase: 'middle' });
    expect(round).not.toBeNull();
    expect(PAIR_KINDS).toContain(round!.kind);
    expect(round!.gameIds).toHaveLength(2);
  });

  it('late phase targets boundary pairs (promotion or higher-lower)', () => {
    let state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 4 });
    for (let i = 0; i < 16; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 6 });
      state = applyOutcome(state, { type: 'pairwise', winnerId: 3, loserId: 4 });
    }
    const round = selectRound(state, { phase: 'late' });
    expect(round).not.toBeNull();
    expect(['promotion', 'higher-lower']).toContain(round!.kind);
    expect(round!.gameIds).toHaveLength(2);
  });
});

describe('selectRound — variety control', () => {
  it('avoids immediately repeating the previous kind', () => {
    const state = createRankingState([1, 2, 3, 4, 5, 6]);
    const first = selectRound(state, { phase: 'early' })!;
    const next = selectRound(state, { phase: 'early', recentKinds: [first.kind] })!;
    expect(next.kind).not.toBe(first.kind);
    // Still a same-arity (five-card) alternative.
    expect(FIVE_GROUP).toContain(next.kind);
    expect(next.gameIds).toHaveLength(5);
  });

  it('does not over-use the five-card lineup', () => {
    // Round 3 of the early cycle maps to a lineup; with lineup played recently it must swap.
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 3);
    const round = selectRound(state, {
      phase: 'early',
      recentKinds: ['lineup', 'champion', 'lineup'],
    })!;
    expect(round.kind).not.toBe('lineup');
    expect(FIVE_GROUP).toContain(round.kind);
  });

  it('is deterministic for the same state and options', () => {
    const a = createRankingState([1, 2, 3, 4, 5], { seed: 9 });
    const b = createRankingState([1, 2, 3, 4, 5], { seed: 9 });
    expect(selectRound(a, { phase: 'early' })).toEqual(selectRound(b, { phase: 'early' }));
  });
});

describe('selectRound — special injections', () => {
  it('injects a single-game replay test on schedule', () => {
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 6);
    const round = selectRound(state, { phase: 'middle' })!;
    expect(round.kind).toBe('replay');
    expect(round.gameIds).toHaveLength(1);
  });

  it('skips the replay injection when it would repeat the last kind', () => {
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 6);
    const round = selectRound(state, { phase: 'middle', recentKinds: ['replay'] })!;
    expect(round.kind).not.toBe('replay');
  });

  it('injects a gauntlet with a challenger plus opponents on schedule', () => {
    let state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 5 });
    for (let i = 0; i < 6; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 6 });
    }
    state = { ...state, round: 8 };
    const round = selectRound(state, { phase: 'middle' })!;
    expect(round.kind).toBe('gauntlet');
    expect(round.gameIds.length).toBeGreaterThanOrEqual(2);
    expect(round.anchorId).toBe(round.gameIds[0]);
  });
});

describe('buildGauntlet', () => {
  it('orders opponents weakest-to-strongest above the challenger', () => {
    let state = createRankingState([1, 2, 3, 4], { seed: 2 });
    // Make 1 the strongest and 4 the weakest, leaving 4 high-uncertainty as challenger.
    for (let i = 0; i < 10; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 2 });
      state = applyOutcome(state, { type: 'pairwise', winnerId: 2, loserId: 3 });
    }
    const gauntlet = buildGauntlet(state)!;
    expect(gauntlet.kind).toBe('gauntlet');
    const opponentIds = gauntlet.gameIds.slice(1);
    const ratings = opponentIds.map((id) => state.games[String(id)].rating);
    const ascending = [...ratings].sort((a, b) => a - b);
    expect(ratings).toEqual(ascending);
  });
});

describe('canReveal', () => {
  it('unlocks at the confidence threshold', () => {
    expect(canReveal(REVEAL_MIN_CONFIDENCE - 1, 0)).toBe(false);
    expect(canReveal(REVEAL_MIN_CONFIDENCE, 0)).toBe(true);
  });

  it('unlocks at the round floor even with low confidence', () => {
    expect(canReveal(0, REVEAL_MIN_ROUNDS - 1)).toBe(false);
    expect(canReveal(0, REVEAL_MIN_ROUNDS)).toBe(true);
  });
});
