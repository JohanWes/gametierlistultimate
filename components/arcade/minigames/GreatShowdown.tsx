'use client';

import { useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { useIsMobile } from '@/lib/use-is-mobile';

import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { DesktopBracket } from './great-showdown/DesktopBracket';
import { MobileTournament } from './great-showdown/MobileTournament';
import {
  activeBout,
  championId,
  createTournament,
  pickWinner,
  toOutcomes,
  type Bout,
  type TournamentState,
} from './great-showdown/tournament';

/**
 * Minigame — "The Great Showdown." An eight-game knockout with a redemption round: nine bouts in a
 * single round (4 quarters, 2 redemption duels, 2 semis, 1 finale), each emitted as a weighted
 * pairwise duel so the round banks a large, honest confidence push. Desktop renders the whole
 * bracket; mobile plays it as a full-screen 1v1 sequence. The tournament logic lives in the pure
 * `tournament.ts` state machine; this component only drives it and folds the result back to the engine.
 */
export interface ShowdownViewProps {
  gameById: Map<number, Game>;
  state: TournamentState;
  active: Bout | null;
  /** The winner being shown during the brief post-tap beat, before the bracket advances. */
  pendingWinnerId: number | null;
  champion: number | null;
  onPick: (winnerId: number) => void;
}

/** Beat held after a normal pick / the finale so the win animation lands before advancing. */
const PICK_BEAT_MS = 320;
const FINALE_BEAT_MS = 900;
/** How long the champion screen lingers before the arcade moves on. */
const CHAMPION_HOLD_MS = 1100;

export function GreatShowdown({ games, onComplete }: MinigameProps) {
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const complete = useComplete(onComplete);

  const seedIds = useMemo(() => games.slice(0, 8).map((g) => g.igdbId), [games]);
  const gameById = useMemo(() => new Map(games.map((g) => [g.igdbId, g])), [games]);

  const [state, setState] = useState<TournamentState>(() => createTournament(seedIds));
  const [pendingWinnerId, setPendingWinnerId] = useState<number | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const onPick = useCallback(
    (winnerId: number) => {
      if (pendingWinnerId !== null) return;
      const current = activeBout(stateRef.current);
      if (!current || (winnerId !== current.a && winnerId !== current.b)) return;

      setPendingWinnerId(winnerId);
      playSound(current.round === 'finale' ? 'reveal' : 'success');

      const beat = reduce ? 0 : current.round === 'finale' ? FINALE_BEAT_MS : PICK_BEAT_MS;
      timer.current = window.setTimeout(() => {
        const next = pickWinner(stateRef.current, winnerId);
        setState(next);
        setPendingWinnerId(null);
        if (next.done) complete(toOutcomes(next), reduce ? 0 : CHAMPION_HOLD_MS);
      }, beat);
    },
    [pendingWinnerId, reduce, complete],
  );

  if (games.length < 8) return null;

  const viewProps: ShowdownViewProps = {
    gameById,
    state,
    active: activeBout(state),
    pendingWinnerId,
    champion: championId(state),
    onPick,
  };

  return isMobile ? <MobileTournament {...viewProps} /> : <DesktopBracket {...viewProps} />;
}
