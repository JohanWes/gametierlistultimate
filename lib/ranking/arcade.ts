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
  | 'replay';

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
}

/* ------------------------------------------------------------------ tunables */

/** Reveal unlocks once the list is "good enough" — confidence OR a round floor. */
export const REVEAL_MIN_CONFIDENCE = 45;
export const REVEAL_MIN_ROUNDS = 12;

const REPLAY_EVERY = 6;
const GAUNTLET_EVERY = 8;
const LINEUP_COOLDOWN = 3;

/** Five-card group minigames (all consume exactly 5 games). */
const FIVE_GROUP: MinigameKind[] = ['champion', 'sacrifice', 'keep2kill3', 'lineup'];
/** Two-card pair minigames by phase (all consume exactly 2 games). */
const PAIR_MIDDLE: MinigameKind[] = ['duel', 'rivalry', 'higher-lower'];
const PAIR_LATE: MinigameKind[] = ['promotion', 'higher-lower', 'duel'];

/* ------------------------------------------------------------------ phase + reveal */

/**
 * Map engine confidence + progress onto a pacing phase. Forces `early` for the first few
 * rounds so every game gets some coverage before we trust tier boundaries.
 */
export function derivePhase(state: RankingState, confidence?: number): RankingPhase {
  const c = confidence ?? computeConfidence(state).global;
  if (state.round < 4 || c < 35) return 'early';
  if (c < 65) return 'middle';
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

  const injected = injectedRound(state, options.phase, recent[0]);
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
): ArcadeRound | null {
  const round = state.round;
  if (round <= 0) return null;

  // Replay test: a light supporting signal on an under-sampled game. Not in the late phase,
  // where we want boundary precision rather than fresh single-game reads.
  if (phase !== 'late' && round % REPLAY_EVERY === 0 && last !== 'replay') {
    const target = lowestComparisonGame(state);
    if (target !== null) return { kind: 'replay', gameIds: [target], anchorId: target };
  }

  // Gauntlet: a dramatic mid-phase climb against progressively stronger opponents.
  if (phase === 'middle' && round % GAUNTLET_EVERY === 0 && last !== 'gauntlet') {
    const gauntlet = buildGauntlet(state);
    if (gauntlet) return gauntlet;
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
  const pool = FIVE_GROUP.includes(kind) ? FIVE_GROUP : phase === 'late' ? PAIR_LATE : PAIR_MIDDLE;
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
