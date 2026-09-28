/**
 * Arcade orchestration — pure, deterministic logic that turns the trusted ranking engine
 * (./index) into a varied sequence of minigames. Kept out of React so it can be unit-tested
 * in isolation. The engine still owns all scoring; this module only decides *which* minigame
 * to show next, guarding against repetition and sprinkling in special rounds the engine's
 * matchup selector doesn't model directly (gauntlet, replay test).
 */

import {
  computeConfidence,
  computeTiers,
  nextMatchup,
  TIER_ORDER,
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
  | 'podium'
  | 'tier-check'
  | 'tier-rush';

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
export const REVEAL_MIN_ROUNDS = 7;

/**
 * Confidence at which the run switches from the multi-item "building" phase to
 * the 1-on-1 "fine-tuning" phase. Keep multi-item rounds (groups + bucket /
 * podium / gauntlet / vibe / replay specials) firing through ~95% so the climb
 * to high confidence stays fast; beyond this, only fine-tuning 1-on-1s (boundary
 * pairs + the bracket tournament, which is just three 1v1s) sharpen placements.
 */
export const LATE_PHASE_CONFIDENCE = 80;

const LINEUP_COOLDOWN = 3;

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
 *  1. A scheduled special round (`SPECIALS`) the engine doesn't model — skipped if it would
 *     immediately repeat the previous kind.
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

interface Special {
  kind: MinigameKind;
  every: number;
  /** Also fires in the late (fine-tuning) phase; otherwise build-phase only. */
  lateToo?: boolean;
  /** The first game id doubles as the round's anchor. */
  anchored?: boolean;
  build: (state: RankingState, vibeSeenIds: number[]) => SpecialPick | null;
}

type SpecialPick = { gameIds: number[]; boundary?: Tier };

const pick = (gameIds: number[] | null): SpecialPick | null => gameIds && { gameIds };

/**
 * Scheduled special rounds, checked in order; the first whose cadence hits (and that would not
 * repeat the previous kind) and can be filled wins. Cadences are staggered (4/5/6/7/8/9/10/12/13) so they
 * rarely collide; on a collision the earlier entry wins.
 */
const SPECIALS: Special[] = [
  // Tier Check: confirm (or nudge) the engine's shakiest tier in one glance — a sneak peek of the
  // board that banks absolute-placement credit for up to six games at once.
  { kind: 'tier-check', every: 12, lateToo: true, build: tierCheckRound },
  // Tier Rush: rapid-fire gut calls — eight fresh covers dealt one at a time onto S–F lanes.
  { kind: 'tier-rush', every: 10, build: (state, seen) => pick(tierRushIds(state, seen)) },
  // Replay test: a light supporting signal on an under-sampled game.
  {
    kind: 'replay',
    every: 6,
    anchored: true,
    build: (state) => {
      const id = lowestComparisonGame(state);
      return id === null ? null : { gameIds: [id] };
    },
  },
  // Gauntlet: a dramatic climb against progressively stronger opponents.
  { kind: 'gauntlet', every: 8, anchored: true, build: (state) => pick(gauntletIds(state)) },
  // Vibe-meter: rate four under-sampled games at once on a 0–100 slider, never re-rating a cover
  // from an earlier vibe round; skipped when too few fresh games remain.
  { kind: 'vibe', every: 5, build: (state, seen) => pick(leastSampledIds(state, 4, seen)) },
  // Bucket sort: the high-signal coverage workhorse — six games into ordered buckets, emitting
  // every cross-bucket implication at once.
  { kind: 'bucket', every: 4, build: (state) => pick(leastSampledIds(state, 6)) },
  // Podium: pick and order a top three out of six; the rest are losers.
  { kind: 'podium', every: 7, build: (state) => pick(leastSampledIds(state, 6)) },
  // Great Showdown: an 8-game knockout plus a redemption round, 9 bouts in one round. Checked
  // before the bracket so it wins a cadence collision.
  {
    kind: 'great-showdown',
    every: 13,
    lateToo: true,
    anchored: true,
    build: (state) => pick(showdownIds(state)),
  },
  // Bracket: a four-game knockout (two semis + a final) — three 1v1s in one round, so it fits the
  // fine-tuning phase too.
  {
    kind: 'bracket',
    every: 9,
    lateToo: true,
    anchored: true,
    build: (state) => pick(leastSampledIds(state, 4)),
  },
];

function injectedRound(
  state: RankingState,
  phase: RankingPhase,
  last: MinigameKind | undefined,
  vibeSeenIds: number[] = [],
): ArcadeRound | null {
  if (state.round <= 0) return null;
  for (const { kind, every, lateToo, anchored, build } of SPECIALS) {
    if ((phase === 'late' && !lateToo) || state.round % every !== 0 || last === kind) continue;
    const picked = build(state, vibeSeenIds);
    if (picked) {
      return { kind, ...picked, anchorId: anchored ? picked.gameIds[0] : undefined };
    }
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

/** Round size for Tier Rush. */
export const TIER_RUSH_SIZE = 8;

/**
 * Tier Check: the displayed tier (3+ games, every one already compared at least once) with the
 * lowest mean confidence, skipping tiers that are already settled. Returns its (up to six)
 * least-confident games, best-first, with the tier as the round's `boundary`.
 */
export function tierCheckRound(state: RankingState): SpecialPick | null {
  const tiers = computeTiers(state);
  const { perGame } = computeConfidence(state);
  const conf = (id: number) => perGame[String(id)] ?? 0;

  let best: { tier: Tier; ids: number[]; mean: number } | null = null;
  for (const tier of TIER_ORDER) {
    const ids = tiers[tier];
    if (ids.length < 3 || ids.some((id) => state.games[String(id)].comparisons < 1)) continue;
    const mean = ids.reduce((sum, id) => sum + conf(id), 0) / ids.length;
    if (mean >= 90 || (best && mean >= best.mean)) continue;
    best = { tier, ids, mean };
  }
  if (!best) return null;

  const gameIds = [...best.ids]
    .sort((a, b) => conf(a) - conf(b) || a - b)
    .slice(0, 6)
    .sort((a, b) => state.games[String(b)].rating - state.games[String(a)].rating || a - b);
  return { gameIds, boundary: best.tier };
}

/** Tier Rush: the least-sampled games not already rated in a vibe/rush round. */
export function tierRushIds(state: RankingState, vibeSeenIds: number[] = []): number[] | null {
  return leastSampledIds(state, TIER_RUSH_SIZE, vibeSeenIds);
}

/**
 * Gauntlet: the highest-uncertainty game (most to learn) climbs against up to three better-ranked
 * opponents, ordered weakest→strongest so the run escalates. Challenger first.
 */
function gauntletIds(state: RankingState): number[] | null {
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

  return [challenger.gameId, ...opponents.map((g) => g.gameId)];
}

/**
 * Great Showdown: the eight least-sampled games (where the engine has the least to go on),
 * re-sorted by current rating so the quarterfinal pairs are neighbours — close, informative bouts
 * rather than blowouts. Seed order `[QF1a, QF1b, QF2a, QF2b, QF3a, QF3b, QF4a, QF4b]`; the
 * component derives the redemption/semi/final bouts from winners and losers.
 */
function showdownIds(state: RankingState): number[] | null {
  const picked = leastSampledIds(state, 8);
  if (!picked) return null;
  return picked.sort((a, b) => {
    const ra = state.games[String(a)]?.rating ?? 0;
    const rb = state.games[String(b)]?.rating ?? 0;
    return rb - ra || a - b;
  });
}

/**
 * Pick the `n` least-sampled (then most-uncertain) game ids, skipping `exclude`, or null if fewer
 * than `n` remain.
 */
function leastSampledIds(state: RankingState, n: number, exclude: number[] = []): number[] | null {
  const games = Object.values(state.games).filter((g) => !exclude.includes(g.gameId));
  if (games.length < n) return null;
  return games
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
