'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import type { RankingOutcome } from '@/lib/ranking';
import { cn } from '@/lib/utils';

import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard, type CardState } from './ArcadeCard';
import { MinigameHeader } from './MinigameHeader';

type Stage = 'semi1' | 'semi2' | 'final' | 'done';

const STAGE_LABEL: Record<Stage, string> = {
  semi1: 'Semifinal 1',
  semi2: 'Semifinal 2',
  final: 'The final',
  done: 'Champion',
};

/**
 * Minigame — "Showdown." A four-game knockout: two semifinals feed a final. Each tap picks a
 * winner; winners advance and the champion is crowned. Emits the three duels actually played, with
 * the final weighted heavier so the champion climbs hard.
 */
export function Bracket({ games, onComplete }: MinigameProps) {
  const reduce = useReducedMotion();
  const complete = useComplete(onComplete);
  const [a, b, c, d] = games;
  const [stage, setStage] = useState<Stage>('semi1');
  const [w1, setW1] = useState<Game | null>(null);
  const [w2, setW2] = useState<Game | null>(null);
  const [champion, setChampion] = useState<number | null>(null);
  const results = useRef<RankingOutcome[]>([]);

  if (!a || !b || !c || !d) return null;

  const pushDuel = (winner: Game, loser: Game, weight?: number) => {
    results.current.push(
      weight === undefined
        ? { type: 'pairwise', winnerId: winner.igdbId, loserId: loser.igdbId }
        : { type: 'pairwise', winnerId: winner.igdbId, loserId: loser.igdbId, weight },
    );
  };

  const pick = (winner: Game, loser: Game) => {
    if (stage === 'semi1') {
      pushDuel(winner, loser);
      setW1(winner);
      playSound('success');
      setStage('semi2');
    } else if (stage === 'semi2') {
      pushDuel(winner, loser);
      setW2(winner);
      playSound('success');
      setStage('final');
    } else if (stage === 'final') {
      pushDuel(winner, loser, 1.3);
      setChampion(winner.igdbId);
      setStage('done');
      playSound('reveal');
      complete(results.current);
    }
  };

  // The pair the player is currently deciding.
  const active: [Game, Game] | null =
    stage === 'semi1'
      ? [a, b]
      : stage === 'semi2'
        ? [c, d]
        : stage === 'final' && w1 && w2
          ? [w1, w2]
          : null;

  const stateFor = (game: Game): CardState => {
    if (champion !== null) return champion === game.igdbId ? 'win' : 'dim';
    if (active && (active[0].igdbId === game.igdbId || active[1].igdbId === game.igdbId)) return 'idle';
    return 'dim';
  };

  const Seed = ({ game, decided }: { game: Game; decided: boolean }) => {
    const live =
      !decided && active && (active[0].igdbId === game.igdbId || active[1].igdbId === game.igdbId);
    return (
      <motion.div layout className={cn(decided && 'pointer-events-none')}>
        <ArcadeCard
          game={game}
          size="zone"
          state={champion === game.igdbId ? 'win' : decided ? 'dim' : stateFor(game)}
          badge={champion === game.igdbId ? '♛' : undefined}
          onSelect={
            live
              ? () => {
                  const other = active![0].igdbId === game.igdbId ? active![1] : active![0];
                  pick(game, other);
                }
              : undefined
          }
        />
      </motion.div>
    );
  };

  return (
    <div className="flex flex-col items-center">
      <MinigameHeader
        tone="accent"
        eyebrow="Showdown"
        title={stage === 'done' ? 'We have a winner.' : 'Tap the winner.'}
        hint={STAGE_LABEL[stage]}
      />

      {/* Bracket: two semis on the left feed the final on the right. */}
      <div className="flex items-center gap-3 sm:gap-6">
        <div className="flex flex-col gap-6">
          <div
            className={cn(
              'flex gap-2 rounded-tile border p-2 transition-colors',
              stage === 'semi1' ? 'border-accent/60 bg-accent/5' : 'border-border',
            )}
          >
            <Seed game={a} decided={stage !== 'semi1'} />
            <Seed game={b} decided={stage !== 'semi1'} />
          </div>
          <div
            className={cn(
              'flex gap-2 rounded-tile border p-2 transition-colors',
              stage === 'semi2' ? 'border-accent/60 bg-accent/5' : 'border-border',
            )}
          >
            <Seed game={c} decided={stage !== 'semi2'} />
            <Seed game={d} decided={stage !== 'semi2'} />
          </div>
        </div>

        {/* Connector + final */}
        <div aria-hidden className="h-px w-4 bg-border sm:w-8" />

        <div
          className={cn(
            'flex min-h-[calc(var(--cover-zone)*4/3_+_1rem)] items-center gap-2 rounded-tile border p-2 transition-colors',
            stage === 'final' ? 'border-teal/60 bg-teal/5' : 'border-dashed border-border/70',
          )}
        >
          {w1 ? (
            <Seed game={w1} decided={stage === 'done'} />
          ) : (
            <FinalSlot label="W1" />
          )}
          {w2 ? (
            <Seed game={w2} decided={stage === 'done'} />
          ) : (
            <FinalSlot label="W2" />
          )}
        </div>
      </div>

      {champion !== null ? (
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 font-display text-lg font-black uppercase tracking-[0.06em] text-teal"
        >
          ♛ {games.find((g) => g.igdbId === champion)?.title}
        </motion.p>
      ) : null}
    </div>
  );
}

function FinalSlot({ label }: { label: string }) {
  return (
    <div className="flex aspect-[3/4] w-[var(--cover-zone)] items-center justify-center rounded-tile border border-dashed border-border/70 bg-surface/20 font-display text-sm font-black uppercase text-muted/40">
      {label}
    </div>
  );
}
