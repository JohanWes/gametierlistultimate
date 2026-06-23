export type RankingPhase = 'early' | 'late';

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export const TIER_ORDER: Tier[] = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];

export interface GamePrior {
  gameId: number;
  /** 0-100 IGDB rating, capped so it cannot dominate user signal. */
  rating?: number | null;
  /** 0-100ish popularity signal, capped so it cannot dominate user signal. */
  popularity?: number | null;
}

export interface GameRating {
  gameId: number;
  rating: number;
  uncertainty: number;
  comparisons: number;
  lastSeenRound: number | null;
  priorOffset: number;
}

export interface RecentMatchup {
  round: number;
  gameIds: number[];
}

export interface RankingState {
  version: 1;
  seed: number;
  round: number;
  games: Record<string, GameRating>;
  recentMatchups: RecentMatchup[];
}

export type MatchupType =
  | 'duel'
  | 'rivalry'
  | 'higher-lower'
  | 'promotion'
  | 'lineup'
  | 'keep2kill3'
  | 'champion'
  | 'sacrifice';

export interface Matchup {
  type: MatchupType;
  gameIds: number[];
  anchorId?: number;
  boundary?: Tier;
}

export type RankingOutcome =
  | { type: 'pairwise'; winnerId: number; loserId: number; weight?: number }
  | { type: 'lineup'; orderedIds: number[]; weight?: number }
  | { type: 'pick-k-of-n'; pickedIds: number[]; rejectedIds: number[]; weight?: number }
  | { type: 'champion'; winnerId: number; opponentIds: number[]; weight?: number }
  | { type: 'sacrifice'; loserId: number; opponentIds: number[]; weight?: number }
  | { type: 'about-equal'; gameIds: [number, number]; weight?: number }
  | {
      type: 'replay';
      gameId: number;
      answer: 'immediately' | 'maybe' | 'probably-not' | 'never';
      weight?: number;
    }
  | { type: 'vibe'; gameId: number; tier: Tier; score?: number; weight?: number }
  | { type: 'bucket'; buckets: number[][]; weight?: number }
  | { type: 'skip'; gameIds?: number[] };

export type TierMap = Record<Tier, number[]>;

export interface ConfidenceResult {
  global: number;
  perGame: Record<string, number>;
}

interface ScoringOpts {
  weight?: number;
  markSeen?: boolean;
  countComparison?: boolean;
}

const VERSION = 1 as const;
const BASE_RATING = 1500;
const INITIAL_UNCERTAINTY = 350;
const MIN_UNCERTAINTY = 60;
const MAX_PRIOR_OFFSET = 75;
const RECENT_WINDOW = 4;
const RECENT_HISTORY = 10;

/**
 * Tier boundary thresholds (high → low), mirrored from `tierForRating`. A skill at or above
 * `TIER_THRESHOLDS[0]` is S; below `TIER_THRESHOLDS[5]` is F; the gaps between are A…E.
 */
const TIER_THRESHOLDS = [1615, 1565, 1505, 1445, 1375, 1325] as const;

/**
 * Standard deviation of the tier posterior `skill ~ Normal(rating, σ)`, derived from the *evidence
 * count* as σ = SIGMA_K / √(comparisons + ε) — the standard 1/√n sharpening of an estimate from n
 * observations (Fisher-information style). This deliberately decouples confidence from the engine's
 * slow multiplicative `uncertainty` (which plateaus high and is coupled to rating-step damping):
 * each comparison genuinely sharpens the tier estimate, so a well-separated game reaches a confident
 * tier placement after a handful of comparisons instead of needing the rating spread to fully settle.
 * SIGMA_K is set so ~9 comparisons gives σ≈20 (a game centred in a ~60-wide tier band then reads
 * ~90% confident). Tuned against `simulation.test.ts` / `aggressiveness.test.ts` — accuracy first.
 */
const SIGMA_K = 60;
const SIGMA_EPS = 0.25;
const SIGMA_MIN = 10;
const SIGMA_MAX = 130;

/**
 * Comparisons at which the coverage ramp saturates. Below this a game's confidence is damped toward
 * zero (a never-played game reads 0), so the global meter does not inflate from priors alone; above
 * it, confidence is governed purely by tier-placement certainty. Deliberately small (≪ the old
 * "6 direct comparisons" coverage target) so well-separated games stop needing redundant sampling.
 */
const COVERAGE_FULL_AT = 3;

/**
 * Extra comparison credit banked by a vibe-meter placement, on top of its weight. A vibe is a direct,
 * precise absolute statement of a game's tier (the player drags it onto the S–F scale), so it is worth
 * far more tier-confidence than a single pairwise nudge — enough that one decisive placement lifts the
 * game most of the way up the coverage ramp. Kept below "instant certainty" so a careless drag can't
 * fully settle a game on its own.
 */
const VIBE_CONFIDENCE_CREDIT = 2.4;

/**
 * Extra comparison credit banked by a replay-test answer. A replay verdict ("how soon would you
 * replay this?") is an absolute tier statement like a vibe, but coarser — a 4-way choice rather than a
 * precise slider — so it earns roughly half the confidence credit. Enough that a replay round
 * registers real progress instead of nudging the meter by a rounding error.
 */
const REPLAY_CONFIDENCE_CREDIT = 1.2;

/**
 * Cadence for the rare two-card breather during the early (multi-item) phase.
 * Picked as the first round not claimed by any scheduled special (bucket 4,
 * vibe 5, replay 6, podium 7, gauntlet 8, bracket 9), so a breather never
 * shadows a special and the run stays mostly multi-item.
 */
export const PAIR_BREAK_EVERY = 11;

export function createRankingState(
  games: Array<number | GamePrior>,
  options?: { seed?: number },
): RankingState {
  const seen = new Set<number>();
  const entries: Record<string, GameRating> = {};

  for (const game of games) {
    const prior = typeof game === 'number' ? { gameId: game } : game;
    if (!Number.isFinite(prior.gameId) || seen.has(prior.gameId)) continue;
    seen.add(prior.gameId);

    const priorOffset = computePriorOffset(prior);
    entries[String(prior.gameId)] = {
      gameId: prior.gameId,
      rating: BASE_RATING + priorOffset,
      uncertainty: INITIAL_UNCERTAINTY,
      comparisons: 0,
      lastSeenRound: null,
      priorOffset,
    };
  }

  return {
    version: VERSION,
    seed: options?.seed ?? 1,
    round: 0,
    games: entries,
    recentMatchups: [],
  };
}

export function parseRankingState(value: unknown): RankingState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Partial<RankingState>;
  if (state.version !== VERSION || typeof state.seed !== 'number' || typeof state.round !== 'number') {
    return null;
  }
  if (!state.games || typeof state.games !== 'object') return null;

  const games: Record<string, GameRating> = {};
  for (const raw of Object.values(state.games)) {
    if (!raw || typeof raw !== 'object') return null;
    const game = raw as Partial<GameRating>;
    if (
      typeof game.gameId !== 'number' ||
      typeof game.rating !== 'number' ||
      typeof game.uncertainty !== 'number' ||
      typeof game.comparisons !== 'number'
    ) {
      return null;
    }
    games[String(game.gameId)] = {
      gameId: game.gameId,
      rating: game.rating,
      uncertainty: game.uncertainty,
      comparisons: game.comparisons,
      lastSeenRound: typeof game.lastSeenRound === 'number' ? game.lastSeenRound : null,
      priorOffset: typeof game.priorOffset === 'number' ? game.priorOffset : 0,
    };
  }

  return {
    version: VERSION,
    seed: state.seed,
    round: state.round,
    games,
    recentMatchups: Array.isArray(state.recentMatchups)
      ? state.recentMatchups
          .filter((m): m is RecentMatchup => {
            return (
              !!m &&
              typeof m === 'object' &&
              typeof (m as RecentMatchup).round === 'number' &&
              Array.isArray((m as RecentMatchup).gameIds)
            );
          })
          .map((m) => ({ round: m.round, gameIds: m.gameIds.filter(Number.isFinite) }))
      : [],
  };
}

export function serializeRankingState(state: RankingState): RankingState {
  return cloneState(state);
}

/**
 * Drop a game from the ranking entirely: removes its rating entry and any recent-matchup history
 * that references it. Leaves `round`/`seed` untouched so the next `selectRound` deterministically
 * yields a fresh round minus this game. Used when the player deletes a game from the pool.
 */
export function removeGameFromState(state: RankingState, gameId: number): RankingState {
  const next = cloneState(state);
  delete next.games[String(gameId)];
  next.recentMatchups = next.recentMatchups.filter((m) => !m.gameIds.includes(gameId));
  return next;
}

export function applyOutcome(state: RankingState, outcome: RankingOutcome): RankingState {
  const next = cloneState(state);
  const beforeRound = next.round;

  switch (outcome.type) {
    case 'pairwise':
      applyPair(next, outcome.winnerId, outcome.loserId, 1, outcome.weight ?? 1);
      markParticipants(next, [outcome.winnerId, outcome.loserId], beforeRound + 1);
      break;
    case 'lineup':
      applyLineup(next, outcome.orderedIds, outcome.weight ?? 0.55);
      markParticipants(next, outcome.orderedIds, beforeRound + 1);
      break;
    case 'pick-k-of-n':
      for (const winner of outcome.pickedIds) {
        for (const loser of outcome.rejectedIds) {
          applyPair(next, winner, loser, 1, outcome.weight ?? 0.68);
        }
      }
      markParticipants(next, [...outcome.pickedIds, ...outcome.rejectedIds], beforeRound + 1);
      break;
    case 'champion':
      for (const loser of outcome.opponentIds) {
        applyPair(next, outcome.winnerId, loser, 1, outcome.weight ?? 0.8);
      }
      markParticipants(next, [outcome.winnerId, ...outcome.opponentIds], beforeRound + 1);
      break;
    case 'sacrifice':
      for (const winner of outcome.opponentIds) {
        applyPair(next, winner, outcome.loserId, 1, outcome.weight ?? 0.8);
      }
      markParticipants(next, [outcome.loserId, ...outcome.opponentIds], beforeRound + 1);
      break;
    case 'bucket':
      applyBucket(next, outcome.buckets, outcome.weight ?? 0.9);
      markParticipants(next, outcome.buckets.flat(), beforeRound + 1);
      break;
    case 'about-equal':
      applyPair(next, outcome.gameIds[0], outcome.gameIds[1], 0.5, outcome.weight ?? 0.35);
      markParticipants(next, outcome.gameIds, beforeRound + 1);
      break;
    case 'replay':
      applyReplay(next, outcome.gameId, outcome.answer, outcome.weight ?? 0.35);
      markParticipants(next, [outcome.gameId], beforeRound + 1);
      break;
    case 'vibe':
      applyVibe(next, outcome.gameId, outcome.tier, outcome.weight ?? 0.6, outcome.score);
      markParticipants(next, [outcome.gameId], beforeRound + 1);
      break;
    case 'skip':
      markParticipants(next, outcome.gameIds ?? [], beforeRound + 1, false);
      break;
  }

  next.round += 1;
  return next;
}

/**
 * Confidence is now a *tier-placement* measure, not a sampling count. Per game it is the probability
 * the game sits in the tier the list will actually *display* it in (`placementConfidence` against the
 * `computeTiers` assignment, not the raw rating band), damped by a small coverage ramp so a game that
 * has never been compared still reads 0 (priors alone must not inflate the meter). Measuring against
 * the displayed tier keeps the meter honest under the S-tier cap in `computeTiers`: a top game whose
 * rating sits in the S band but is displayed in A (because S is capped) is scored as "A or better",
 * not falsely as certain-S. Because the rating scale is already globally transitive, a game can reach
 * high confidence after only a few comparisons once its posterior clears the surrounding boundaries —
 * it no longer needs to be directly sampled ~6 times. Global confidence ≈ the expected fraction of
 * games shown in the right tier.
 */
export function computeConfidence(state: RankingState): ConfidenceResult {
  const perGame: Record<string, number> = {};
  const games = gameList(state);

  const displayed = computeTiers(state);
  const tierOf = new Map<number, Tier>();
  for (const tier of TIER_ORDER) {
    for (const id of displayed[tier]) tierOf.set(id, tier);
  }

  for (const game of games) {
    const tier = tierOf.get(game.gameId) ?? tierForRating(game.rating);
    const coverage = clamp(game.comparisons / COVERAGE_FULL_AT, 0, 1);
    perGame[String(game.gameId)] = Math.round(placementConfidence(game, tier) * coverage * 100);
  }

  const global = games.length
    ? Math.round(Object.values(perGame).reduce((sum, value) => sum + value, 0) / games.length)
    : 0;

  return { global, perGame };
}

export function nextMatchup(state: RankingState, phase: RankingPhase): Matchup | null {
  const games = gameList(state);
  if (games.length < 2) return null;

  if (phase === 'late') {
    const boundary = pickBoundaryPair(state);
    if (boundary) return boundary;
    const pair = pickClosePair(state);
    if (!pair) return null;
    return { type: 'higher-lower', gameIds: pair, anchorId: pair[0] };
  }

  // early: the multi-item phase. A rare two-card breather (every PAIR_BREAK_EVERY
  // rounds, once the opening is past) breaks up the run for variety; otherwise a
  // five-card group minigame, the fastest way to spread ratings toward S/F.
  if (state.round > 0 && state.round % PAIR_BREAK_EVERY === 0) {
    const pair = pickClosePair(state);
    if (pair) {
      const breakTypes = ['duel', 'rivalry', 'higher-lower'] as const;
      const type = breakTypes[state.round % breakTypes.length];
      return { type, gameIds: pair, anchorId: pair[0] };
    }
  }

  const group = pickGroup(state, Math.min(5, games.length));
  const cycle = ['champion', 'sacrifice', 'keep2kill3', 'lineup'] as const;
  const type = cycle[state.round % cycle.length];
  return { type: group.length < 5 && type === 'keep2kill3' ? 'champion' : type, gameIds: group };
}

/**
 * A representative rating squarely inside each tier's threshold band. Used by `assignTier` so a
 * manual placement round-trips through `computeTiers` (the engine stays the single source of truth).
 */
export const TIER_BANDS: Record<Tier, number> = {
  S: 1700,
  A: 1600,
  B: 1535,
  C: 1475,
  D: 1410,
  E: 1337,
  F: 1250,
};

/**
 * Manually place a game in a tier. Sets its rating to the tier's representative band and marks it as
 * confident (low uncertainty, comparison credit) so a later recompute keeps the user's choice. Returns
 * a new state; unknown gameIds are returned unchanged.
 */
export function assignTier(state: RankingState, gameId: number, tier: Tier): RankingState {
  const game = state.games[String(gameId)];
  if (!game) return state;

  const next = cloneState(state);
  const target = next.games[String(gameId)];
  target.rating = TIER_BANDS[tier];
  target.uncertainty = MIN_UNCERTAINTY;
  target.comparisons = Math.max(target.comparisons, 8);
  return next;
}

/** Public tier lookup for a raw rating (mirrors the internal thresholds). */
export function tierForRating(rating: number): Tier {
  if (rating >= 1615) return 'S';
  if (rating >= 1565) return 'A';
  if (rating >= 1505) return 'B';
  if (rating >= 1445) return 'C';
  if (rating >= 1375) return 'D';
  if (rating >= 1325) return 'E';
  return 'F';
}

export function computeTiers(state: RankingState): TierMap {
  const tiers = emptyTiers();
  const ranked = gameList(state).sort(compareRanked);

  for (const game of ranked) {
    tiers[tierForRating(game.rating)].push(game.gameId);
  }

  const sLimit = Math.max(1, Math.ceil(ranked.length * 0.1));
  if (ranked.length >= 10 && tiers.S.length > sLimit) {
    const demoted = tiers.S.splice(sLimit);
    tiers.A.unshift(...demoted);
  }

  return tiers;
}

function applyLineup(state: RankingState, orderedIds: number[], weight: number): void {
  for (let i = 0; i < orderedIds.length; i += 1) {
    for (let j = i + 1; j < orderedIds.length; j += 1) {
      const distance = j - i;
      applyPair(state, orderedIds[i], orderedIds[j], 1, weight / Math.sqrt(distance));
    }
  }
}

/**
 * Apply a bucket-sort verdict — the player drops several games into ordered buckets (best → worst).
 * High-signal, low-cost: a single round emits every cross-bucket implication at once (every game in a
 * higher bucket beats every game in a lower one) at full weight, which is the fastest way to spread
 * ratings toward the extremes. Same-bucket pairs are nudged together as a soft `about-equal` so they
 * gain coverage without a forced order. Empty buckets are ignored; bucket order conveys the ranking.
 */
function applyBucket(state: RankingState, buckets: number[][], weight: number): void {
  for (let hi = 0; hi < buckets.length; hi += 1) {
    // Cross-bucket: every higher-bucket game beats every lower-bucket game.
    for (let lo = hi + 1; lo < buckets.length; lo += 1) {
      for (const winner of buckets[hi]) {
        for (const loser of buckets[lo]) {
          applyPair(state, winner, loser, 1, weight);
        }
      }
    }
    // Within-bucket: a soft draw so tied games still accrue coverage.
    const bucket = buckets[hi];
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        applyPair(state, bucket[i], bucket[j], 0.5, weight * 0.33);
      }
    }
  }
}

function applyPair(
  state: RankingState,
  aId: number,
  bId: number,
  scoreA: 1 | 0.5,
  rawWeight: number,
  opts: ScoringOpts = {},
): void {
  const a = state.games[String(aId)];
  const b = state.games[String(bId)];
  if (!a || !b || a.gameId === b.gameId) return;

  const weight = clamp(rawWeight, 0.05, 2);
  const expectedA = expectedScore(a.rating, b.rating);
  const uncertaintyFactor = clamp((a.uncertainty + b.uncertainty) / (INITIAL_UNCERTAINTY * 2), 0.35, 1.5);
  const delta = 52 * weight * uncertaintyFactor * (scoreA - expectedA);

  a.rating += delta;
  b.rating -= delta;

  const reduction = 1 - clamp(0.035 + 0.05 * weight, 0.02, 0.15);
  a.uncertainty = Math.max(MIN_UNCERTAINTY, a.uncertainty * reduction);
  b.uncertainty = Math.max(MIN_UNCERTAINTY, b.uncertainty * reduction);

  if (opts.countComparison !== false) {
    a.comparisons += weight;
    b.comparisons += weight;
  }
}

function applyReplay(
  state: RankingState,
  gameId: number,
  answer: 'immediately' | 'maybe' | 'probably-not' | 'never',
  weight: number,
): void {
  const game = state.games[String(gameId)];
  if (!game) return;

  const targetByAnswer = {
    immediately: BASE_RATING + 90,
    maybe: BASE_RATING + 25,
    'probably-not': BASE_RATING - 45,
    never: BASE_RATING - 110,
  } satisfies Record<typeof answer, number>;

  // Like a vibe but gentler (a coarse 4-way choice, not a precise slider): pull the rating toward the
  // answer's target scaled by how unsettled the game still is, and bank real confidence credit so a
  // replay round registers progress instead of moving a game only a point or two.
  const trust = clamp(game.uncertainty / INITIAL_UNCERTAINTY, 0, 1); // ~1 cold … ~0.17 settled
  const pull = clamp(0.18 + 0.45 * trust, 0.1, 0.6);
  game.rating += pull * (targetByAnswer[answer] - game.rating);

  game.uncertainty = Math.max(MIN_UNCERTAINTY, game.uncertainty * 0.85);
  game.comparisons += clamp(weight, 0.05, 0.75) + REPLAY_CONFIDENCE_CREDIT;
}

/**
 * Map a continuous 0–100 vibe-meter score onto a target rating, smoothly interpolated across the
 * full tier range (0 → F band, 100 → S band). This keeps the meter granular: e.g. 95 pulls harder
 * than 75 even when both classify into the same letter tier, instead of snapping to one of 7 bands.
 */
export function vibeScoreToRating(score: number): number {
  const s = clamp(score, 0, 100);
  return TIER_BANDS.F + (s / 100) * (TIER_BANDS.S - TIER_BANDS.F);
}

/**
 * Apply a "vibe" verdict — the player drags a single game onto a 0–100 meter. Unlike a pairwise
 * nudge this is a *direct, precise absolute placement* of the game's tier, so it is treated as strong
 * evidence rather than a soft hint. The target is the continuous rating for the dragged `score`
 * (`vibeScoreToRating`), falling back to the chosen tier's representative band (`TIER_BANDS[tier]`)
 * when no score is supplied. We pull the rating toward that target by a fraction scaled to how
 * unsettled the game still is: a cold game snaps most of the way (the player just told us where it
 * goes), while a well-established game is only nudged so accumulated pairwise history isn't
 * overwritten. The placement also confers real tier confidence — uncertainty shrinks hard and a solid
 * comparison credit is banked (`VIBE_CONFIDENCE_CREDIT`) so the meter reflects that the player pinned
 * the tier, instead of crawling as it did when a vibe moved only a few rating points.
 */
function applyVibe(
  state: RankingState,
  gameId: number,
  tier: Tier,
  weight: number,
  score?: number,
): void {
  const game = state.games[String(gameId)];
  if (!game) return;

  const targetRating = score != null ? vibeScoreToRating(score) : TIER_BANDS[tier];
  const trust = clamp(game.uncertainty / INITIAL_UNCERTAINTY, 0, 1); // ~1 cold … ~0.17 settled
  const pull = clamp(0.25 + 0.6 * trust, 0.15, 0.8);
  game.rating += pull * (targetRating - game.rating);

  game.uncertainty = Math.max(MIN_UNCERTAINTY, game.uncertainty * 0.78);
  game.comparisons += clamp(weight, 0.05, 0.75) + VIBE_CONFIDENCE_CREDIT;
}

function markParticipants(
  state: RankingState,
  gameIds: readonly number[],
  round: number,
  countRecent = true,
): void {
  const unique = [...new Set(gameIds.filter(Number.isFinite))];
  for (const gameId of unique) {
    const game = state.games[String(gameId)];
    if (game) game.lastSeenRound = round;
  }
  if (countRecent && unique.length) {
    state.recentMatchups = [{ round, gameIds: unique }, ...state.recentMatchups].slice(0, RECENT_HISTORY);
  }
}

function pickGroup(state: RankingState, size: number): number[] {
  return gameList(state)
    .map((game) => ({
      game,
      score: uncertaintySelectionScore(state, game) + seededNoise(state, game.gameId) * 0.15,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, size)
    .map(({ game }) => game.gameId);
}

function pickClosePair(state: RankingState): [number, number] | null {
  const games = gameList(state);
  let best: { pair: [number, number]; score: number } | null = null;

  for (let i = 0; i < games.length; i += 1) {
    for (let j = i + 1; j < games.length; j += 1) {
      const a = games[i];
      const b = games[j];
      const distance = Math.abs(a.rating - b.rating);
      const score =
        1 / (1 + distance / 50) +
        (uncertaintySelectionScore(state, a) + uncertaintySelectionScore(state, b)) / 2 -
        recentPairPenalty(state, [a.gameId, b.gameId]) +
        seededNoise(state, a.gameId, b.gameId) * 0.04;
      if (!best || score > best.score) best = { pair: [a.gameId, b.gameId], score };
    }
  }

  return best?.pair ?? null;
}

function pickBoundaryPair(state: RankingState): Matchup | null {
  const games = gameList(state).sort(compareRanked);
  let best: { matchup: Matchup; score: number } | null = null;

  for (let i = 0; i < games.length - 1; i += 1) {
    const upper = games[i];
    const lower = games[i + 1];
    const crossesTier = tierForRating(upper.rating) !== tierForRating(lower.rating);
    const gap = Math.abs(upper.rating - lower.rating);
    const score =
      (crossesTier ? 1.2 : 0.35) +
      1 / (1 + gap / 35) +
      (uncertaintySelectionScore(state, upper) + uncertaintySelectionScore(state, lower)) / 2 -
      recentPairPenalty(state, [upper.gameId, lower.gameId]) +
      seededNoise(state, upper.gameId, lower.gameId) * 0.03;

    if (!best || score > best.score) {
      best = {
        matchup: {
          type: crossesTier ? 'promotion' : 'higher-lower',
          gameIds: [lower.gameId, upper.gameId],
          anchorId: upper.gameId,
          boundary: tierForRating(upper.rating),
        },
        score,
      };
    }
  }

  return best?.matchup ?? null;
}

/**
 * Selection priority — active learning over tier placement. Blends *tier doubt*
 * (`1 - maxTierProbability`: a game whose posterior straddles a boundary is worth comparing) with the
 * raw uncertainty/coverage terms that keep ratings spreading toward the extremes. Tier doubt steers
 * comparisons toward genuinely contested placements; the uncertainty + sparse terms keep
 * under-sampled games in rotation so the scale still fans out. Recency preserves variety.
 */
function uncertaintySelectionScore(state: RankingState, game: GameRating): number {
  const tierDoubt = 1 - maxTierProbability(game);
  const uncertainty = game.uncertainty / INITIAL_UNCERTAINTY;
  const sparse = 1 / (1 + game.comparisons);
  const recency = recentGamePenalty(state, game.gameId);
  return tierDoubt * 0.45 + uncertainty * 0.4 + sparse * 0.3 - recency;
}

function recentGamePenalty(state: RankingState, gameId: number): number {
  const game = state.games[String(gameId)];
  if (!game || game.lastSeenRound === null) return 0;
  const age = state.round - game.lastSeenRound;
  if (age >= RECENT_WINDOW) return 0;
  return (RECENT_WINDOW - age) / RECENT_WINDOW;
}

function recentPairPenalty(state: RankingState, gameIds: readonly number[]): number {
  const key = [...gameIds].sort((a, b) => a - b).join(':');
  const recent = state.recentMatchups.find((m) => m.gameIds.slice().sort((a, b) => a - b).join(':') === key);
  if (!recent) return 0;
  const age = state.round - recent.round;
  return age < RECENT_WINDOW ? 1.5 : 0.35;
}

function computePriorOffset(prior: GamePrior): number {
  const ratingOffset =
    typeof prior.rating === 'number' && Number.isFinite(prior.rating) ? (prior.rating - 75) * 2 : 0;
  const popularityOffset =
    typeof prior.popularity === 'number' && Number.isFinite(prior.popularity)
      ? (prior.popularity - 50) * 0.35
      : 0;
  return clamp(ratingOffset + popularityOffset, -MAX_PRIOR_OFFSET, MAX_PRIOR_OFFSET);
}

function expectedScore(aRating: number, bRating: number): number {
  return 1 / (1 + 10 ** ((bRating - aRating) / 400));
}

/** Tier-posterior std-dev (rating units) from a game's accumulated comparison evidence (σ ∝ 1/√n). */
function ratingSigma(comparisons: number): number {
  return clamp(SIGMA_K / Math.sqrt(comparisons + SIGMA_EPS), SIGMA_MIN, SIGMA_MAX);
}

/** Standard normal CDF, P(X < x) for X ~ Normal(mean, sigma). */
function normalCdf(x: number, mean: number, sigma: number): number {
  return 0.5 * (1 + erf((x - mean) / (Math.SQRT2 * Math.max(sigma, 1e-6))));
}

/** Abramowitz & Stegun 7.1.26 erf approximation (max abs error ~1.5e-7). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/**
 * Probability mass that a game's skill falls in each tier band, treating `skill ~ Normal(rating, σ)`.
 * Returned high → low: index 0 = S … 6 = F. This is the core of the tier-placement view of the
 * ranking: confidence and selection both read off how cleanly a game's posterior sits inside one band
 * versus straddling a boundary, instead of how many times it was directly sampled.
 */
function tierProbabilities(game: GameRating): number[] {
  const sigma = ratingSigma(game.comparisons);
  const cdf = TIER_THRESHOLDS.map((t) => normalCdf(t, game.rating, sigma));
  const probs: number[] = [1 - cdf[0]]; // S: skill >= top threshold
  for (let k = 1; k < TIER_THRESHOLDS.length; k += 1) {
    probs.push(cdf[k - 1] - cdf[k]); // band between adjacent thresholds
  }
  probs.push(cdf[cdf.length - 1]); // F: skill < bottom threshold
  return probs;
}

/** Confidence that a game belongs to its single most-likely tier (1 = certain, ~0.14 = no idea). */
function maxTierProbability(game: GameRating): number {
  return Math.max(...tierProbabilities(game));
}

/** Rating band [lo, hi) for a tier (S open above, F open below), from the shared thresholds. */
function tierBand(tier: Tier): { lo: number; hi: number } {
  const idx = TIER_ORDER.indexOf(tier);
  const hi = idx <= 0 ? Infinity : TIER_THRESHOLDS[idx - 1];
  const lo = idx >= TIER_THRESHOLDS.length ? -Infinity : TIER_THRESHOLDS[idx];
  return { lo, hi };
}

/**
 * Probability the game's skill is consistent with the tier it is *displayed* in. Normally that is
 * the mass inside the tier's rating band. When a display rule (the S-tier cap in `computeTiers`) shows
 * a game one tier below where its rating sits, we open the band's far edge so the game reads as "that
 * tier or better" rather than as miscalibrated — the meter must agree with what the user actually sees.
 */
function placementConfidence(game: GameRating, displayedTier: Tier): number {
  const sigma = ratingSigma(game.comparisons);
  let { lo, hi } = tierBand(displayedTier);
  if (game.rating >= hi) hi = Infinity; // demoted below its rating band (S cap) → "this tier or above"
  if (game.rating < lo) lo = -Infinity; // promoted above its rating band → "this tier or below"
  const pHi = hi === Infinity ? 1 : normalCdf(hi, game.rating, sigma);
  const pLo = lo === -Infinity ? 0 : normalCdf(lo, game.rating, sigma);
  return clamp(pHi - pLo, 0, 1);
}

function emptyTiers(): TierMap {
  return { S: [], A: [], B: [], C: [], D: [], E: [], F: [] };
}

function gameList(state: RankingState): GameRating[] {
  return Object.values(state.games);
}

function compareRanked(a: GameRating, b: GameRating): number {
  return b.rating - a.rating || a.gameId - b.gameId;
}

function cloneState(state: RankingState): RankingState {
  const games: Record<string, GameRating> = {};
  for (const [id, game] of Object.entries(state.games)) {
    games[id] = { ...game };
  }
  return {
    version: VERSION,
    seed: state.seed,
    round: state.round,
    games,
    recentMatchups: state.recentMatchups.map((m) => ({ round: m.round, gameIds: [...m.gameIds] })),
  };
}

function seededNoise(state: RankingState, ...parts: number[]): number {
  let value = state.seed ^ Math.imul(state.round + 1, 0x9e3779b1);
  for (const part of parts) {
    value ^= Math.imul(part + 0x85ebca6b, 0xc2b2ae35);
    value = (value << 13) | (value >>> 19);
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

