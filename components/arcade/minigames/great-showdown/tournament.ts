import type { RankingOutcome } from '@/lib/ranking';

/**
 * Pure state machine for the Great Showdown — an eight-game knockout with a redemption round, kept
 * out of React so it can be unit-tested in isolation (mirrors how `lib/ranking/arcade.ts` keeps the
 * round logic pure). Nine bouts play in this order:
 *
 *   QF1 QF2 QF3 QF4  →  R1 R2 (the four first-round losers get a second chance)  →  SF1 SF2  →  Final
 *
 * Quarterfinal pairs come straight from the seeded id order: (0,1)(2,3)(4,5)(6,7). The component
 * resolves each bout by tapping a winner; the redemption / semi / final bouts materialize from the
 * quarterfinal winners and losers. Each bout carries the weight the engine should score it at.
 */

export type ShowdownRound = 'QF' | 'redemption' | 'SF' | 'finale';

export interface Bout {
  /** Stable id, e.g. 'QF1', 'R1', 'SF2', 'F'. */
  id: string;
  round: ShowdownRound;
  a: number;
  b: number;
  weight: number;
  winnerId: number | null;
  loserId: number | null;
}

export interface TournamentState {
  seededIds: number[];
  bouts: Bout[];
  /** Index into `bouts` of the bout currently being decided, or `bouts.length` when finished. */
  activeIndex: number;
  done: boolean;
}

/** Per-round scoring weights. Escalates with depth but stays under the engine's clamp ceiling (2.0). */
export const SHOWDOWN_WEIGHTS = {
  QF: 1.0,
  redemption: 0.9,
  SF: 1.25,
  finale: 1.5,
} as const satisfies Record<ShowdownRound, number>;

/** Total bouts a full Great Showdown plays. */
export const TOTAL_BOUTS = 9;

function bout(id: string, round: ShowdownRound, a: number, b: number): Bout {
  return { id, round, a, b, weight: SHOWDOWN_WEIGHTS[round], winnerId: null, loserId: null };
}

/** Seed the four quarterfinals from the eight ids; later rounds are added as winners resolve. */
export function createTournament(seededIds: number[]): TournamentState {
  const s = seededIds;
  return {
    seededIds: s,
    bouts: [
      bout('QF1', 'QF', s[0], s[1]),
      bout('QF2', 'QF', s[2], s[3]),
      bout('QF3', 'QF', s[4], s[5]),
      bout('QF4', 'QF', s[6], s[7]),
    ],
    activeIndex: 0,
    done: false,
  };
}

/** The bout awaiting a decision, or `null` when the tournament is finished. */
export function activeBout(state: TournamentState): Bout | null {
  return state.bouts[state.activeIndex] ?? null;
}

/**
 * Resolve the active bout in favour of `winnerId`, then advance. When a round fills up the next
 * round's bouts are appended (redemption + semis after the quarters; the final after the semis).
 * Returns a new state; an invalid winner (not in the active bout, or already finished) is a no-op.
 */
export function pickWinner(state: TournamentState, winnerId: number): TournamentState {
  const current = activeBout(state);
  if (!current || (winnerId !== current.a && winnerId !== current.b)) return state;

  const bouts = state.bouts.map((b) => ({ ...b }));
  const decided = bouts[state.activeIndex];
  decided.winnerId = winnerId;
  decided.loserId = winnerId === decided.a ? decided.b : decided.a;

  const activeIndex = state.activeIndex + 1;

  // Quarterfinals just finished: stage the redemption duels (losers) and the semifinals (winners).
  if (decided.id === 'QF4') {
    const w = (id: string) => bouts.find((b) => b.id === id)!.winnerId!;
    const l = (id: string) => bouts.find((b) => b.id === id)!.loserId!;
    bouts.push(
      bout('R1', 'redemption', l('QF1'), l('QF2')),
      bout('R2', 'redemption', l('QF3'), l('QF4')),
      bout('SF1', 'SF', w('QF1'), w('QF2')),
      bout('SF2', 'SF', w('QF3'), w('QF4')),
    );
  }

  // Semifinals just finished: stage the finale.
  if (decided.id === 'SF2') {
    const w = (id: string) => bouts.find((b) => b.id === id)!.winnerId!;
    bouts.push(bout('F', 'finale', w('SF1'), w('SF2')));
  }

  return { ...state, bouts, activeIndex, done: decided.id === 'F' };
}

/** The nine played duels as engine outcomes — call once the tournament is `done`. */
export function toOutcomes(state: TournamentState): RankingOutcome[] {
  return state.bouts
    .filter((b) => b.winnerId !== null && b.loserId !== null)
    .map((b) => ({
      type: 'pairwise' as const,
      winnerId: b.winnerId!,
      loserId: b.loserId!,
      weight: b.weight,
    }));
}

/** The grand champion (finale winner), or null until the finale is decided. */
export function championId(state: TournamentState): number | null {
  return state.bouts.find((b) => b.id === 'F')?.winnerId ?? null;
}

/** Bouts of a round in play order — used by the views to render pips and the bracket. */
export function boutsForRound(state: TournamentState, round: ShowdownRound): Bout[] {
  return state.bouts.filter((b) => b.round === round);
}

/** Rounds in play order, with how many bouts each ultimately holds — for pip rails. */
export const ROUND_PLAN: ReadonlyArray<{ round: ShowdownRound; count: number; short: string }> = [
  { round: 'QF', count: 4, short: 'QF' },
  { round: 'redemption', count: 2, short: 'RD' },
  { round: 'SF', count: 2, short: 'SF' },
  { round: 'finale', count: 1, short: 'F' },
];

/** Find a bout slot by id even before it has materialized (returns undefined until then). */
export function getBout(state: TournamentState, id: string): Bout | undefined {
  return state.bouts.find((b) => b.id === id);
}

/** Human label + "n of m" position for the active bout, for the round header. */
export function roundHeading(state: TournamentState): { title: string; position: string } {
  const active = activeBout(state);
  if (!active) return { title: 'Champion', position: '' };

  const labels: Record<ShowdownRound, string> = {
    QF: 'Quarterfinal',
    redemption: 'Redemption',
    SF: 'Semifinal',
    finale: 'The finale',
  };
  const plan = ROUND_PLAN.find((p) => p.round === active.round)!;
  const resolved = boutsForRound(state, active.round).filter((b) => b.winnerId !== null).length;
  return {
    title: labels[active.round],
    position: plan.count > 1 ? `${resolved + 1} of ${plan.count}` : '',
  };
}
