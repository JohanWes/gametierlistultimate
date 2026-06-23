/**
 * Arcade orchestration — pure, deterministic logic that turns the trusted ranking engine
 * (./index) into a varied sequence of minigames. Kept out of React so it can be unit-tested
 * in isolation. The engine still owns all scoring; this module only decides *which* minigame
 * to show next, guarding against repetition and sprinkling in special rounds the engine's
 * matchup selector doesn't model directly (gauntlet, replay test).
 */

import {
  computeConfidence,
  nextMatchup,
  type RankingPhase,
  type RankingState,
  type Tier,
} from './index';

export type MinigameKind =
  | 'duel'
  | 'lineup'
  | 'keep2kill3'
  | 'sacrifice'
  | 'champion'
  | 'higher-lower'
  | 'rivalry'
  | 'promotion'
  | 'gauntlet'
  | 'replay'
  | 'vibe'
  | 'bucket'
  | 'bracket'
  | 'great-showdown'
  | 'podium';

export interface ArcadeRound {
  kind: MinigameKind;
  /** Games involved, in matchup order (anchor/challenger first where relevant). */
  gameIds: number[];
  anchorId?: number;
  boundary?: Tier;
}

export interface SelectOptions {
  phase: RankingPhase;
  /** Most-recent-first list of the kinds already played, for variety control. */
  recentKinds?: MinigameKind[];
  /**
   * Game ids that have already appeared in a previous vibe-meter round. The vibe builder skips
   * these so a player never rates the same cover on the S–F slider twice. When too few fresh
   * games remain to fill a round, the vibe injection is skipped (a normal matchup plays instead).
   */
  vibeSeenIds?: number[];
}

/* ------------------------------------------------------------------ tunables */

/** Reveal unlocks once the list is "good enough" — confidence OR a round floor. */
export const REVEAL_MIN_CONFIDENCE = 45;
export const REVEAL_MIN_ROUNDS = 12;

/**
 * Confidence at which the run switches from the multi-item "building" phase to
 * the 1-on-1 "fine-tuning" phase. Keep multi-item rounds (groups + bucket /
 * podium / gauntlet / vibe / replay specials) firing through ~95% so the climb
 * to high confidence stays fast; beyond this, only fine-tuning 1-on-1s (boundary
 * pairs + the bracket tournament, which is just three 1v1s) sharpen placements.
 */
export const LATE_PHASE_CONFIDENCE = 80;

const REPLAY_EVERY = 6;
const GAUNTLET_EVERY = 8;
const VIBE_EVERY = 5;
const VIBE_POOL_SIZE = 4;
const LINEUP_COOLDOWN = 3;

/**
 * Multi-game special rounds. Their cadences are staggered against the existing specials (5 / 6 / 8) and
 * they are checked *after* them, so the frequent bucket round (every 4) lands on round 4 and other gaps
 * without ever shadowing a replay / gauntlet / vibe slot. These pull the run toward the extremes fast.
 */
const BUCKET_EVERY = 4;
const BUCKET_POOL_SIZE = 6;
const PODIUM_EVERY = 7;
const PODIUM_POOL_SIZE = 6;
const BRACKET_EVERY = 9;
const BRACKET_POOL_SIZE = 4;

/**
 * The Great Showdown: an 8-game knockout with a redemption round — 9 bouts in one round (4 quarters,
 * 2 redemption duels for the first-round losers, 2 semis, 1 finale). The heaviest, highest-signal
 * special, so it fires rarely (every 13, staggered against the others) and is checked *before* the
 * bracket so it wins the occasional cadence collision. Allowed in both phases like the bracket.
 */
const GREAT_SHOWDOWN_EVERY = 13;
const GREAT_SHOWDOWN_POOL_SIZE = 8;

/** Five-card group minigames (all consume exactly 5 games). */
const FIVE_GROUP: MinigameKind[] = ['champion', 'sacrifice', 'keep2kill3', 'lineup'];
/** Two-card pair minigames by phase (all consume exactly 2 games). */
const PAIR_EARLY: MinigameKind[] = ['duel', 'rivalry', 'higher-lower'];
const PAIR_LATE: MinigameKind[] = ['promotion', 'higher-lower', 'duel'];

/* ------------------------------------------------------------------ phase + reveal */

/**
 * Map engine confidence + progress onto a pacing phase. Forces `early` for the first few
 * rounds so every game gets some coverage before we trust tier boundaries. The early phase
 * is the whole "building" stretch — multi-item rounds plus a rare 2-card breather — and
 * runs until confidence is high enough that only fine-tuning 1-on-1s remain useful.
 */
export function derivePhase(state: RankingState, confidence?: number): RankingPhase {
  const c = confidence ?? computeConfidence(state).global;
  if (state.round < 4 || c < LATE_PHASE_CONFIDENCE) return 'early';
  return 'late';
}

export function canReveal(confidence: number, round: number): boolean {
  return confidence >= REVEAL_MIN_CONFIDENCE || round >= REVEAL_MIN_ROUNDS;
}

/* ------------------------------------------------------------------ round selection */

/**
 * Choose the next minigame round. Order of preference:
 *  1. A scheduled special round (replay / gauntlet) the engine doesn't model — skipped if it
 *     would immediately repeat the previous kind.
 *  2. The engine's matchup, mapped 1:1 to a minigame kind.
 *  3. A same-arity alternative when the chosen kind would repeat or over-use the lineup.
 */
export function selectRound(state: RankingState, options: SelectOptions): ArcadeRound | null {
  const recent = options.recentKinds ?? [];

  const injected = injectedRound(state, options.phase, recent[0], options.vibeSeenIds);
  if (injected) return injected;

  const matchup = nextMatchup(state, options.phase);
  if (!matchup) return null;

  let kind = matchup.type as MinigameKind;
  if (needsSwap(kind, recent)) {
    kind = alternativeKind(kind, options.phase, recent);
  }

  return {
    kind,
    gameIds: matchup.gameIds,
    anchorId: matchup.anchorId,
    boundary: matchup.boundary,
  };
}

function injectedRound(
  state: RankingState,
  phase: RankingPhase,
  last: MinigameKind | undefined,
  vibeSeenIds?: number[],
): ArcadeRound | null {
  const round = state.round;
  if (round <= 0) return null;

  // Replay test: a light supporting signal on an under-sampled game. Not in the late phase,
  // where we want boundary precision rather than fresh single-game reads.
  if (phase !== 'late' && round % REPLAY_EVERY === 0 && last !== 'replay') {
    const target = lowestComparisonGame(state);
    if (target !== null) return { kind: 'replay', gameIds: [target], anchorId: target };
  }

  // Gauntlet: a dramatic climb against progressively stronger opponents. Fires throughout
  // the early (multi-item) phase on its cadence; the late phase is reserved for fine-tuning.
  if (phase !== 'late' && round % GAUNTLET_EVERY === 0 && last !== 'gauntlet') {
    const gauntlet = buildGauntlet(state);
    if (gauntlet) return gauntlet;
  }

  // Vibe-meter: rate several under-sampled games at once on an S–F slider. A coverage booster in
  // the early/middle phases; skipped in the late phase where boundary precision matters more than
  // fresh absolute reads. Its 5-round cadence sits between replay (6) and gauntlet (8) so the
  // scheduled specials rarely collide.
  if (phase !== 'late' && round % VIBE_EVERY === 0 && last !== 'vibe') {
    const vibe = buildVibeRound(state, vibeSeenIds);
    if (vibe) return vibe;
  }

  // Bucket sort: the high-signal coverage workhorse. Drops ~6 games into ordered buckets, emitting
  // every cross-bucket implication at once — the fastest way to spread ratings toward S/F. Frequent
  // (every 4) and allowed outside the late phase.
  if (phase !== 'late' && round % BUCKET_EVERY === 0 && last !== 'bucket') {
    const bucket = buildBucketRound(state);
    if (bucket) return bucket;
  }

  // Podium: pick and order a top three out of a larger group; the rest are losers.
  if (phase !== 'late' && round % PODIUM_EVERY === 0 && last !== 'podium') {
    const podium = buildPodium(state);
    if (podium) return podium;
  }

  // Great Showdown: the big one — an 8-game knockout plus a redemption round, 9 bouts in a single
  // round. The strongest confidence push available, so it rates aggressively. Checked before the
  // bracket so it wins a rare cadence collision; allowed in both phases. Needs eight games.
  if (round % GREAT_SHOWDOWN_EVERY === 0 && last !== 'great-showdown') {
    const showdown = buildGreatShowdown(state);
    if (showdown) return showdown;
  }

  // Bracket: a four-game knockout (two semis + a final) — i.e. three 1v1s in one round. It earns
  // a place in *both* phases: a dramatic beat during the build, and a compact tournament during
  // fine-tuning (where it folds three boundary-style duels into a single satisfying round).
  if (round % BRACKET_EVERY === 0 && last !== 'bracket') {
    const bracket = buildBracket(state);
    if (bracket) return bracket;
  }

  return null;
}

function needsSwap(kind: MinigameKind, recent: MinigameKind[]): boolean {
  if (recent[0] === kind) return true;
  if (kind === 'lineup' && recent.slice(0, LINEUP_COOLDOWN).includes('lineup')) return true;
  return false;
}

function alternativeKind(
  kind: MinigameKind,
  phase: RankingPhase,
  recent: MinigameKind[],
): MinigameKind {
  const pool = FIVE_GROUP.includes(kind) ? FIVE_GROUP : phase === 'late' ? PAIR_LATE : PAIR_EARLY;
  const lineupOverused = recent.slice(0, LINEUP_COOLDOWN).includes('lineup');
  const candidates = pool.filter((k) => k !== kind);

  for (const k of candidates) {
    if (k === recent[0]) continue;
    if (k === 'lineup' && lineupOverused) continue;
    return k;
  }
  return candidates[0] ?? kind;
}

/* ------------------------------------------------------------------ special builders */

/**
 * Build a gauntlet: the highest-uncertainty game (most to learn) climbs against up to three
 * better-ranked opponents, ordered weakest→strongest so the run escalates.
 */
export function buildGauntlet(state: RankingState): ArcadeRound | null {
  const ranked = Object.values(state.games).sort(
    (a, b) => b.rating - a.rating || a.gameId - b.gameId,
  );
  if (ranked.length < 2) return null;

  // Exclude the current #1 so there is always somewhere to climb.
  const challenger = ranked
    .slice(1)
    .reduce((best, g) => (g.uncertainty > best.uncertainty ? g : best));
  const idx = ranked.findIndex((g) => g.gameId === challenger.gameId);

  // Stronger games sit above the challenger in the descending list; reverse so the run starts
  // with the weakest of them and ends with the strongest.
  const opponents = ranked.slice(Math.max(0, idx - 3), idx).reverse();
  if (opponents.length === 0) return null;

  return {
    kind: 'gauntlet',
    gameIds: [challenger.gameId, ...opponents.map((g) => g.gameId)],
    anchorId: challenger.gameId,
  };
}

/**
 * Build a vibe-meter round: gather the `VIBE_POOL_SIZE` least-sampled games so a single round of
 * S–F slider verdicts lifts coverage where it's needed most. Falls back to null below the pool
 * size so small lists don't get a stub round. Games whose ids appear in `excludeIds` (i.e. they
 * have already been rated in a previous vibe round) are skipped, so a player never rates the same
 * cover twice; returns null when fewer than `VIBE_POOL_SIZE` fresh games remain, in which case the
 * vibe injection is dropped and a normal matchup plays instead.
 */
export function buildVibeRound(state: RankingState, excludeIds?: number[]): ArcadeRound | null {
  const exclude = excludeIds && excludeIds.length > 0 ? new Set(excludeIds) : null;
  const games = Object.values(state.games).filter((g) => !exclude?.has(g.gameId));
  if (games.length < VIBE_POOL_SIZE) return null;

  const picked = [...games]
    .sort(
      (a, b) =>
        a.comparisons - b.comparisons || b.uncertainty - a.uncertainty || a.gameId - b.gameId,
    )
    .slice(0, VIBE_POOL_SIZE)
    .map((g) => g.gameId);

  return { kind: 'vibe', gameIds: picked };
}

/**
 * Build a bucket-sort round: gather the `BUCKET_POOL_SIZE` least-sampled games so one round of
 * ordered-bucket verdicts both lifts coverage and spreads ratings hard. Null below the pool size.
 */
export function buildBucketRound(state: RankingState): ArcadeRound | null {
  const picked = leastSampledIds(state, BUCKET_POOL_SIZE);
  if (!picked) return null;
  return { kind: 'bucket', gameIds: picked };
}

/**
 * Build a podium round: ~`PODIUM_POOL_SIZE` least-sampled games from which the player picks and orders
 * a top three. Null below the pool size.
 */
export function buildPodium(state: RankingState): ArcadeRound | null {
  const picked = leastSampledIds(state, PODIUM_POOL_SIZE);
  if (!picked) return null;
  return { kind: 'podium', gameIds: picked };
}

/**
 * Build a bracket round: four high-uncertainty games seeded for a two-semi-plus-final knockout. The
 * anchor is the top seed (most-sampled of the four) so the component can frame the bracket. Null
 * below four games.
 */
export function buildBracket(state: RankingState): ArcadeRound | null {
  const picked = leastSampledIds(state, BRACKET_POOL_SIZE);
  if (!picked) return null;
  return { kind: 'bracket', gameIds: picked, anchorId: picked[0] };
}

/**
 * Build a Great Showdown round: the eight least-sampled games seeded into a knockout. We pick by
 * coverage (where the engine has the least to go on), then re-sort the eight by current rating so the
 * quarterfinal pairs are neighbours — close, informative bouts rather than blowouts. Returned in
 * seed order `[QF1a, QF1b, QF2a, QF2b, QF3a, QF3b, QF4a, QF4b]`; the component derives the bracket and
 * the redemption/semi/final bouts from winners and losers. Null below eight games.
 */
export function buildGreatShowdown(state: RankingState): ArcadeRound | null {
  const picked = leastSampledIds(state, GREAT_SHOWDOWN_POOL_SIZE);
  if (!picked) return null;

  const seeded = picked.sort((a, b) => {
    const ra = state.games[String(a)]?.rating ?? 0;
    const rb = state.games[String(b)]?.rating ?? 0;
    return rb - ra || a - b;
  });

  return { kind: 'great-showdown', gameIds: seeded, anchorId: seeded[0] };
}

/** Pick the `n` least-sampled (then most-uncertain) game ids, or null if the pool is smaller than `n`. */
function leastSampledIds(state: RankingState, n: number): number[] | null {
  const games = Object.values(state.games);
  if (games.length < n) return null;
  return [...games]
    .sort(
      (a, b) =>
        a.comparisons - b.comparisons || b.uncertainty - a.uncertainty || a.gameId - b.gameId,
    )
    .slice(0, n)
    .map((g) => g.gameId);
}

function lowestComparisonGame(state: RankingState): number | null {
  const games = Object.values(state.games);
  if (games.length === 0) return null;
  return games.reduce((best, g) =>
    g.comparisons < best.comparisons ||
    (g.comparisons === best.comparisons && g.gameId < best.gameId)
      ? g
      : best,
  ).gameId;
}
