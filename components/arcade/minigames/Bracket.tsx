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

  // The active bout's box is the hero: it grows for real (a larger --cover-zone), the rest of the
  // board dims. Done returns nothing to grow when the champion is crowned — mirroring the Great
  // Showdown, which dims the *whole* tree on the champion beat instead.
  const showActive = stage !== 'done';
  const stageIsFinal = stage === 'final';

  // Active hero cards: enlarged cover (real, not scaled — keeps titles crisp), lift, glow. Final
  // uses teal so the last duel reads distinctly from the amber-beat semis (mirrors Great Showdown).
  const heroClasses = cn(
    'z-20 -translate-y-1 [--cover-zone:var(--cover-bracket-active)]',
    stageIsFinal
      ? 'border-teal/80 bg-teal/5 shadow-[0_18px_50px_rgb(0_0_0/0.42),0_0_38px_rgb(var(--color-teal)/0.32)]'
      : 'border-accent/70 bg-accent/5 shadow-[0_18px_50px_rgb(0_0_0/0.42),0_0_38px_rgb(var(--color-accent)/0.32)]',
  );
  // Ambient context: dim the resting boxes so the live bout owns the eye (copied from the Great
  // Showdown's `!isActive && 'opacity-65'`). Cards keep today's resting --cover-zone.
  const dimClasses = 'opacity-65';

  const glowFor = (): React.ReactNode => {
    if (reduce) return null;
    return (
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-7 -z-10 rounded-full blur-2xl',
          stageIsFinal
            ? 'bg-[radial-gradient(circle,rgb(var(--color-teal)/0.18),transparent_70%)]'
            : 'bg-[radial-gradient(circle,rgb(var(--color-accent)/0.18),transparent_70%)]',
        )}
      />
    );
  };

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

      {/* Bracket: two semis on the left feed the final on the right. On phones the final stacks
          below the semis so the board stays ~2 covers wide instead of overflowing. */}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex flex-col items-start gap-6">
          {(['semi1', 'semi2'] as const).map((st) => {
            const isActive = stage === st && showActive;
            const isDecided = stage !== st;
            return (
              <motion.div
                key={st}
                layout={!reduce}
                data-showdown-bout={st}
                data-active={isActive ? 'true' : 'false'}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30 }}
                className={cn(
                  'relative flex gap-2 rounded-tile border p-2',
                  'transition-[opacity,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                  isActive ? heroClasses : cn(dimClasses, isDecided ? 'border-border' : 'border-dashed border-border/60'),
                )}
              >
                {isActive ? glowFor() : null}
                {st === 'semi1' ? (
                  <>
                    <Seed game={a} decided={stage !== 'semi1'} />
                    <Seed game={b} decided={stage !== 'semi1'} />
                  </>
                ) : (
                  <>
                    <Seed game={c} decided={stage !== 'semi2'} />
                    <Seed game={d} decided={stage !== 'semi2'} />
                  </>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Connector + final */}
        <div aria-hidden className="h-4 w-px bg-border sm:h-px sm:w-8" />

        <motion.div
          layout={!reduce}
          data-showdown-bout="final"
          data-active={stage === 'final' && showActive ? 'true' : 'false'}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30 }}
          className={cn(
            'relative flex min-h-[calc(var(--cover-zone)*4/3_+_1rem)] items-center gap-2 rounded-tile border p-2',
            'transition-[opacity,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
            stage === 'final' && showActive
              ? heroClasses
              : cn(dimClasses, w1 || w2 ? 'border-border' : 'border-dashed border-border/70'),
          )}
        >
          {stage === 'final' && showActive ? glowFor() : null}
          {w1 ? <Seed game={w1} decided={stage === 'done'} /> : <FinalSlot label="W1" />}
          {w2 ? <Seed game={w2} decided={stage === 'done'} /> : <FinalSlot label="W2" />}
        </motion.div>
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
