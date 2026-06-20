import type { GameStatsDoc } from './lists-repo';
import { TIER_ORDER, type Tier, type TierMap } from './ranking';

/**
 * Numeric tier scale for comparison math: S is the top (7), F the bottom (1). The span
 * (max − min = 6) normalizes a tier distance into [0, 1].
 */
export const TIER_SCORE: Record<Tier, number> = {
  S: 7,
  A: 6,
  B: 5,
  C: 4,
  D: 3,
  E: 2,
  F: 1,
};
const TIER_SPAN = TIER_SCORE.S - TIER_SCORE.F; // 6

/** Inverse of TIER_SCORE — map a (rounded) score back onto a tier letter. */
const SCORE_TIER: Record<number, Tier> = {
  7: 'S',
  6: 'A',
  5: 'B',
  4: 'C',
  3: 'D',
  2: 'E',
  1: 'F',
};

/**
 * A game needs at least this many community placements before we trust the crowd's opinion of
 * it. Below this it is excluded from outliers and from the similarity numerator, so the "fun
 * stat" never compares the user against near-zero data. Mirrors the `MIN_POOL_SIZE` guard in
 * `lib/pool-patterns-repo.ts`.
 */
export const MIN_VOTES = 3;

/** At most this many outlier cards are surfaced. */
const MAX_OUTLIERS = 5;

/** Minimum tier-distance from the crowd average for a game to count as a real disagreement. */
const OUTLIER_MIN_MAGNITUDE = 1;

export interface Outlier {
  gameId: number;
  userTier: Tier;
  /** The tier nearest the crowd's average placement for this game. */
  communityTier: Tier;
  /** Whether the user ranked the game higher or lower than the crowd's average. */
  direction: 'higher' | 'lower';
}

export interface ComparisonResult {
  /** 0–100 "similar to N% of players", or null when there isn't enough community data. */
  similarityPercent: number | null;
  outliers: Outlier[];
  /** Number of published lists the aggregate is built from (the "based on N lists" note). */
  sampleSize: number;
}

export interface CompareOptions {
  /** Total published lists, surfaced verbatim as `sampleSize`. */
  sampleSize?: number;
  /**
   * When comparing an already-published list, its own placements are already baked into the
   * aggregate. Setting this removes one vote per game/tier the user placed so the list isn't
   * compared against itself.
   */
  subtractSelf?: boolean;
}

/** Round a continuous tier score onto the nearest tier letter. */
function tierFromScore(score: number): Tier {
  const r = Math.max(1, Math.min(7, Math.round(score)));
  return SCORE_TIER[r];
}

/** First tier each game appears in, so a game maps to exactly one user tier. */
function userTierById(tiers: TierMap): Map<number, Tier> {
  const out = new Map<number, Tier>();
  for (const tier of TIER_ORDER) {
    for (const id of tiers[tier]) {
      if (!out.has(id)) out.set(id, tier);
    }
  }
  return out;
}

/**
 * Compare a user's tier list to the anonymous community aggregate.
 *
 * Similarity (a deliberately simple, explainable "fun stat"): for every game the user placed
 * that has enough community votes, we take the vote-weighted mean *closeness* between the
 * user's tier and each community vote — `closeness = 1 − |Δscore| / 6` ∈ [0, 1]. Games are then
 * weighted by their vote count so well-supported games dominate. The overall percentage is that
 * weighted average × 100: an identical placement scores ~100%, a fully inverted one ~0%.
 *
 * Outliers: the games where the user disagrees most with the crowd average, weighted by how
 * confident the crowd is (more votes + a stronger modal consensus = a louder disagreement).
 */
export function compareToCommunity(
  userTiers: TierMap,
  stats: GameStatsDoc[],
  options: CompareOptions = {},
): ComparisonResult {
  const sampleSize = options.sampleSize ?? 0;
  const placed = userTierById(userTiers);
  const statsById = new Map(stats.map((s) => [s.gameId, s]));

  let weightedAgreement = 0; // Σ total_g · gameAgreement_g
  let totalWeight = 0; // Σ total_g
  const candidates: Array<{ outlier: Outlier; rank: number }> = [];

  for (const [gameId, userTier] of placed) {
    const stat = statsById.get(gameId);
    if (!stat) continue;

    // Effective counts, optionally minus the user's own self-vote.
    const counts = { ...stat.counts } as Record<Tier, number>;
    let total = stat.total;
    if (options.subtractSelf && (counts[userTier] ?? 0) > 0) {
      counts[userTier] -= 1;
      total -= 1;
    }
    if (total < MIN_VOTES) continue;

    const su = TIER_SCORE[userTier];

    let closenessSum = 0; // Σ count_v · closeness_v
    let scoreSum = 0; // Σ count_v · score_v
    let modalCount = -1;
    for (const tier of TIER_ORDER) {
      const c = counts[tier] ?? 0;
      if (c <= 0) continue;
      const sv = TIER_SCORE[tier];
      closenessSum += c * (1 - Math.abs(su - sv) / TIER_SPAN);
      scoreSum += c * sv;
      if (c > modalCount) modalCount = c; // peak height → crowd self-consensus
    }

    const gameAgreement = closenessSum / total;
    const avgScore = scoreSum / total;

    weightedAgreement += total * gameAgreement;
    totalWeight += total;

    const communityTier = tierFromScore(avgScore);
    const magnitude = Math.abs(su - avgScore);
    if (communityTier !== userTier && magnitude >= OUTLIER_MIN_MAGNITUDE) {
      const consensus = modalCount / total; // ∈ (0, 1]
      const support = Math.log(total + 1) * consensus;
      candidates.push({
        outlier: {
          gameId,
          userTier,
          communityTier,
          direction: su > avgScore ? 'higher' : 'lower',
        },
        rank: magnitude * support,
      });
    }
  }

  const similarityPercent =
    totalWeight > 0 ? Math.round(100 * (weightedAgreement / totalWeight)) : null;

  const outliers = candidates
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_OUTLIERS)
    .map((c) => c.outlier);

  return { similarityPercent, outliers, sampleSize };
}
