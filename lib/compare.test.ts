import { describe, expect, it } from 'vitest';

import { compareToCommunity, MIN_VOTES } from './compare';
import type { GameStatsDoc } from './lists-repo';
import { TIER_ORDER, type Tier, type TierMap } from './ranking';

/** Build a community stats doc from a partial per-tier count map. */
function stat(gameId: number, counts: Partial<Record<Tier, number>>): GameStatsDoc {
  const full = {} as Record<Tier, number>;
  let total = 0;
  for (const tier of TIER_ORDER) {
    const c = counts[tier] ?? 0;
    full[tier] = c;
    total += c;
  }
  return { gameId, counts: full, total };
}

/** Build a TierMap from a tier → ids map (missing tiers default to empty). */
function tiers(map: Partial<Record<Tier, number[]>>): TierMap {
  const out = {} as TierMap;
  for (const tier of TIER_ORDER) out[tier] = map[tier] ?? [];
  return out;
}

describe('compareToCommunity — similarity', () => {
  it('scores ~100% when the user matches the crowd on every game', () => {
    const userTiers = tiers({ S: [1], A: [2], F: [3] });
    const stats = [
      stat(1, { S: 10 }),
      stat(2, { A: 8 }),
      stat(3, { F: 12 }),
    ];
    const res = compareToCommunity(userTiers, stats);
    expect(res.similarityPercent).toBe(100);
    expect(res.outliers).toHaveLength(0);
  });

  it('scores low when the user is fully inverted from the crowd', () => {
    // User puts everything at the bottom that the crowd puts at the top, and vice versa.
    const userTiers = tiers({ F: [1], S: [2] });
    const stats = [stat(1, { S: 10 }), stat(2, { F: 10 })];
    const res = compareToCommunity(userTiers, stats);
    expect(res.similarityPercent).toBe(0);
  });

  it('lands in the middle for partial agreement', () => {
    const userTiers = tiers({ B: [1] }); // score 5
    // Crowd evenly split S (7) and D (3): avg closeness = 1 - 2/6 = 0.667.
    const stats = [stat(1, { S: 5, D: 5 })];
    const res = compareToCommunity(userTiers, stats);
    expect(res.similarityPercent).toBe(67);
  });

  it('returns null similarity and no outliers when there is no usable data (cold start)', () => {
    const userTiers = tiers({ S: [1] });
    expect(compareToCommunity(userTiers, []).similarityPercent).toBeNull();
    // A game below the vote threshold is ignored entirely.
    const thin = compareToCommunity(userTiers, [stat(1, { S: MIN_VOTES - 1 })]);
    expect(thin.similarityPercent).toBeNull();
    expect(thin.outliers).toHaveLength(0);
  });

  it('passes sampleSize through verbatim', () => {
    const res = compareToCommunity(tiers({ S: [1] }), [stat(1, { S: 5 })], { sampleSize: 1204 });
    expect(res.sampleSize).toBe(1204);
  });
});

describe('compareToCommunity — outliers', () => {
  it('flags a game the user ranked far below the crowd as a "lower" outlier', () => {
    const userTiers = tiers({ F: [1] }); // user score 1
    const stats = [stat(1, { S: 20 })]; // crowd S (7)
    const { outliers } = compareToCommunity(userTiers, stats);
    expect(outliers).toHaveLength(1);
    expect(outliers[0]).toMatchObject({
      gameId: 1,
      userTier: 'F',
      communityTier: 'S',
      direction: 'lower',
    });
  });

  it('flags a game the user ranked far above the crowd as a "higher" outlier', () => {
    const userTiers = tiers({ S: [1] }); // user score 7
    const stats = [stat(1, { C: 20 })]; // crowd C (4)
    const { outliers } = compareToCommunity(userTiers, stats);
    expect(outliers[0]).toMatchObject({
      gameId: 1,
      userTier: 'S',
      communityTier: 'C',
      direction: 'higher',
    });
  });

  it('does not flag agreement as an outlier', () => {
    const userTiers = tiers({ S: [1] });
    const stats = [stat(1, { S: 9, A: 1 })]; // avg ≈ 6.9 → rounds to S
    expect(compareToCommunity(userTiers, stats).outliers).toHaveLength(0);
  });

  it('excludes low-vote games from outliers even on a large disagreement', () => {
    const userTiers = tiers({ F: [1] });
    const stats = [stat(1, { S: MIN_VOTES - 1 })]; // big gap, but too few votes
    expect(compareToCommunity(userTiers, stats).outliers).toHaveLength(0);
  });

  it('ranks better-supported, larger disagreements first and caps at five', () => {
    const userTiers = tiers({ F: [1, 2, 3, 4, 5, 6] });
    const stats = [
      stat(1, { S: 100 }), // huge gap, strong consensus, many votes → top
      stat(2, { A: 50 }),
      stat(3, { B: 30 }),
      stat(4, { C: 20 }),
      stat(5, { D: 10 }),
      stat(6, { E: 8 }), // smallest gap → dropped past the cap of 5
    ];
    const { outliers } = compareToCommunity(userTiers, stats);
    expect(outliers).toHaveLength(5);
    expect(outliers[0].gameId).toBe(1);
    expect(outliers.map((o) => o.gameId)).not.toContain(6);
  });
});

describe('compareToCommunity — subtractSelf', () => {
  it('removes the user\'s own vote so a published list is not compared to itself', () => {
    const userTiers = tiers({ S: [1] });
    // Only the user's own vote exists for this game → after subtracting self it falls below
    // the threshold and is ignored, yielding no (falsely perfect) similarity.
    const stats = [stat(1, { S: 1 })];
    const res = compareToCommunity(userTiers, stats, { subtractSelf: true });
    expect(res.similarityPercent).toBeNull();
  });

  it('keeps the comparison when enough other votes remain after removing self', () => {
    const userTiers = tiers({ S: [1] });
    const stats = [stat(1, { S: 1, F: 5 })]; // remove the 1 self-vote at S → 5 votes at F remain
    const res = compareToCommunity(userTiers, stats, { subtractSelf: true });
    expect(res.similarityPercent).toBe(0); // user S vs crowd all-F → fully inverted
    expect(res.outliers[0]).toMatchObject({ communityTier: 'F', direction: 'higher' });
  });
});
