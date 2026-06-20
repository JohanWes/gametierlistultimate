import { describe, expect, it } from 'vitest';

import {
  buildBracket,
  buildBucketRound,
  buildGauntlet,
  buildPodium,
  buildVibeRound,
  canReveal,
  derivePhase,
  LATE_PHASE_CONFIDENCE,
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

  it('keeps the multi-item early phase through high confidence, then flips to late', () => {
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 10);
    expect(derivePhase(state, 20)).toBe('early');
    expect(derivePhase(state, 50)).toBe('early');
    expect(derivePhase(state, LATE_PHASE_CONFIDENCE - 1)).toBe('early');
    expect(derivePhase(state, LATE_PHASE_CONFIDENCE)).toBe('late');
  });
});

describe('selectRound — phase matching', () => {
  it('early phase yields a five-card group minigame', () => {
    const round = selectRound(createRankingState([1, 2, 3, 4, 5, 6]), { phase: 'early' });
    expect(round).not.toBeNull();
    expect(FIVE_GROUP).toContain(round!.kind);
    expect(round!.gameIds).toHaveLength(5);
  });

  it('early phase yields a rare two-card breather at the pair-break round', () => {
    // Round 11 is the first round clear of every special cadence (4/5/6/7/8/9)
    // and reserved for the rare 2-card breather that breaks up the multi-item run.
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 11);
    const round = selectRound(state, { phase: 'early' })!;
    expect(PAIR_KINDS).toContain(round.kind);
    expect(round.gameIds).toHaveLength(2);
  });

  it('early phase falls back to a five-card group outside the pair-break round', () => {
    // Round 13: no special cadence hits, not a pair-break round → five-card group.
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 13);
    const round = selectRound(state, { phase: 'early' })!;
    expect(FIVE_GROUP).toContain(round.kind);
    expect(round.gameIds).toHaveLength(5);
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
    const round = selectRound(state, { phase: 'early' })!;
    expect(round.kind).toBe('replay');
    expect(round.gameIds).toHaveLength(1);
  });

  it('skips the replay injection when it would repeat the last kind', () => {
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 6);
    const round = selectRound(state, { phase: 'early', recentKinds: ['replay'] })!;
    expect(round.kind).not.toBe('replay');
  });

  it('injects a gauntlet with a challenger plus opponents on schedule', () => {
    let state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 5 });
    for (let i = 0; i < 6; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 6 });
    }
    state = { ...state, round: 8 };
    const round = selectRound(state, { phase: 'early' })!;
    expect(round.kind).toBe('gauntlet');
    expect(round.gameIds.length).toBeGreaterThanOrEqual(2);
    expect(round.anchorId).toBe(round.gameIds[0]);
  });

  it('injects a vibe-meter round on schedule with 4 games', () => {
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 5);
    const round = selectRound(state, { phase: 'early' })!;
    expect(round.kind).toBe('vibe');
    expect(round.gameIds).toHaveLength(4);
  });

  it('skips the vibe injection in the late phase', () => {
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 5);
    const round = selectRound(state, { phase: 'late' })!;
    expect(round.kind).not.toBe('vibe');
  });

  it('skips the vibe injection when it would repeat the last kind', () => {
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 5);
    const round = selectRound(state, { phase: 'early', recentKinds: ['vibe'] })!;
    expect(round.kind).not.toBe('vibe');
  });
});

describe('multi-game special injections', () => {
  it('injects a bucket-sort round on schedule with 6 games', () => {
    const round = selectRound(stateAtRound([1, 2, 3, 4, 5, 6], 4), { phase: 'early' })!;
    expect(round.kind).toBe('bucket');
    expect(round.gameIds).toHaveLength(6);
  });

  it('injects a podium round on schedule', () => {
    const round = selectRound(stateAtRound([1, 2, 3, 4, 5, 6], 7), { phase: 'early' })!;
    expect(round.kind).toBe('podium');
    expect(round.gameIds).toHaveLength(6);
  });

  it('injects a bracket round on schedule in the early phase', () => {
    const round = selectRound(stateAtRound([1, 2, 3, 4, 5, 6], 9), { phase: 'early' })!;
    expect(round.kind).toBe('bracket');
    expect(round.gameIds).toHaveLength(4);
    expect(round.anchorId).toBe(round.gameIds[0]);
  });

  it('skips the bucket injection when it would repeat the last kind', () => {
    const round = selectRound(stateAtRound([1, 2, 3, 4, 5, 6], 4), {
      phase: 'early',
      recentKinds: ['bucket'],
    })!;
    expect(round.kind).not.toBe('bucket');
  });

  it('skips the heavy multi-game injections in the late phase but keeps the bracket tournament', () => {
    // Bucket/podium/vibe/gauntlet/replay stay gated to the build phase; the bracket is allowed
    // in late phase too because it's just three 1v1s folded into one round — fine-tuning-shaped.
    expect(selectRound(stateAtRound([1, 2, 3, 4, 5, 6], 4), { phase: 'late' })!.kind).not.toBe(
      'bucket',
    );
    expect(selectRound(stateAtRound([1, 2, 3, 4, 5, 6], 5), { phase: 'late' })!.kind).not.toBe(
      'vibe',
    );
    expect(selectRound(stateAtRound([1, 2, 3, 4, 5, 6], 9), { phase: 'late' })!.kind).toBe(
      'bracket',
    );
  });

  it('keeps firing multi-game specials in the early phase at high confidence', () => {
    // The fix: the early (multi-item) phase runs through LATE_PHASE_CONFIDENCE, so a
    // bucket round still fires at round 4 even when confidence is well past the old
    // 65 cliff. Late phase only begins at LATE_PHASE_CONFIDENCE.
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 4);
    const phase = derivePhase(state, LATE_PHASE_CONFIDENCE - 5);
    expect(phase).toBe('early');
    const round = selectRound(state, { phase })!;
    expect(round.kind).toBe('bucket');
    expect(round.gameIds).toHaveLength(6);
  });
});

describe('buildBucketRound / buildPodium / buildBracket', () => {
  it('bucket and podium pull six games, bracket pulls four', () => {
    const state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 2 });
    expect(buildBucketRound(state)!.gameIds).toHaveLength(6);
    expect(buildPodium(state)!.gameIds).toHaveLength(6);
    expect(buildBracket(state)!.gameIds).toHaveLength(4);
  });

  it('returns null when the pool is too small', () => {
    const small = createRankingState([1, 2, 3], { seed: 1 });
    expect(buildBucketRound(small)).toBeNull();
    expect(buildPodium(small)).toBeNull();
    expect(buildBracket(small)).toBeNull();
  });

  it('seeds the least-sampled games into the bucket pool', () => {
    let state = createRankingState([1, 2, 3, 4, 5, 6, 7, 8], { seed: 2 });
    // Heavily sample games 1 and 2 so they fall outside the six least-sampled.
    for (let i = 0; i < 8; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 2 });
    }
    const bucket = buildBucketRound(state)!;
    expect(bucket.gameIds).toHaveLength(6);
    expect(bucket.gameIds).not.toContain(1);
    expect(bucket.gameIds).not.toContain(2);
  });
});

describe('buildVibeRound', () => {
  it('picks the 4 least-sampled games', () => {
    let state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 2 });
    // Give games 1 and 2 lots of comparisons so they're excluded from the vibe pool.
    for (let i = 0; i < 6; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 2 });
    }
    const vibe = buildVibeRound(state)!;
    expect(vibe.kind).toBe('vibe');
    expect(vibe.gameIds).toHaveLength(4);
    expect(vibe.gameIds).not.toContain(1);
    expect(vibe.gameIds).not.toContain(2);
  });

  it('returns null when the pool has fewer than 4 games', () => {
    const state = createRankingState([1, 2, 3], { seed: 1 });
    expect(buildVibeRound(state)).toBeNull();
  });

  it('returns null when exclusion drops the fresh pool below VIBE_POOL_SIZE', () => {
    const state = createRankingState([1, 2, 3, 4, 5], { seed: 3 });
    // Exclude 3 of the 5 games; only 2 remain — below the 4-game pool size.
    expect(buildVibeRound(state, [1, 2, 3])).toBeNull();
  });

  it('picks only fresh games when enough remain after exclusion', () => {
    let state = createRankingState([1, 2, 3, 4, 5, 6, 7, 8], { seed: 4 });
    for (let i = 0; i < 6; i += 1) {
      state = applyOutcome(state, { type: 'pairwise', winnerId: 1, loserId: 2 });
    }
    // Exclude the four least-sampled (3/4/5/6); the next four (7/8/1/2) should be picked.
    const vibe = buildVibeRound(state, [3, 4, 5, 6])!;
    expect(vibe.kind).toBe('vibe');
    expect(vibe.gameIds).toHaveLength(4);
    for (const id of [3, 4, 5, 6]) {
      expect(vibe.gameIds).not.toContain(id);
    }
  });

  it('treats an empty excludeIds array as no exclusion', () => {
    const state = createRankingState([1, 2, 3, 4, 5, 6], { seed: 5 });
    const vibe = buildVibeRound(state, [])!;
    expect(vibe.gameIds).toHaveLength(4);
  });
});

describe('selectRound — vibe exclusion', () => {
  it('a vibe-cadence round with vibeSeenIds yields only fresh games', () => {
    const state = stateAtRound([1, 2, 3, 4, 5, 6, 7, 8], 5);
    // Exclude the four least-sampled ids; the vibe round must draw from the rest.
    const round = selectRound(state, { phase: 'early', vibeSeenIds: [3, 4, 5, 6] })!;
    expect(round.kind).toBe('vibe');
    for (const id of [3, 4, 5, 6]) {
      expect(round.gameIds).not.toContain(id);
    }
  });

  it('falls through to a non-vibe round when no fresh games fill the pool', () => {
    const state = stateAtRound([1, 2, 3, 4, 5, 6], 5);
    // Exclude the entire pool — vibe must be skipped and a normal matchup takes over.
    const round = selectRound(state, {
      phase: 'early',
      vibeSeenIds: [1, 2, 3, 4, 5, 6],
    })!;
    expect(round.kind).not.toBe('vibe');
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
