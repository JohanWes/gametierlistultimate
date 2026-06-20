'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

import { ArcadeCard, type CardState } from './ArcadeCard';
import { MinigameHeader } from './MinigameHeader';

export interface VersusBoardProps {
  left: Game;
  right: Game;
  prompt: string;
  /** Small kicker above the prompt, e.g. "Rivalry" or "Promotion battle". */
  eyebrow?: string;
  /** A chip rendered on the seam, e.g. a tier badge for a promotion battle. */
  seamBadge?: React.ReactNode;
  onPick: (winner: Game, loser: Game) => void;
}

/**
 * The arcade's signature face-off: two covers slam in from opposite edges, split by a glowing
 * tier-spectrum seam with a "VS" chip. Tapping a cover crowns it (glow + scale) and dims the
 * loser. Reused by Duel, Rivalry, and Promotion. Manages only the local win/lose visual; the
 * wrapper decides what outcome the pick means.
 */
export function VersusBoard({ left, right, prompt, eyebrow, seamBadge, onPick }: VersusBoardProps) {
  const reduce = useReducedMotion();
  const [winnerId, setWinnerId] = useState<number | null>(null);

  const pick = (winner: Game, loser: Game) => {
    if (winnerId !== null) return;
    setWinnerId(winner.igdbId);
    playSound('success');
    onPick(winner, loser);
  };

  const stateFor = (g: Game): CardState =>
    winnerId === null ? 'idle' : winnerId === g.igdbId ? 'win' : 'lose';

  return (
    <div className="flex flex-col items-center">
      <MinigameHeader tone="teal" eyebrow={eyebrow} title={prompt} />

      <div className="grid w-full max-w-2xl grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
        <motion.div
          className="flex justify-end"
          initial={reduce ? false : { x: -40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        >
          <ArcadeCard game={left} state={stateFor(left)} onSelect={() => pick(left, right)} />
        </motion.div>

        <Seam badge={seamBadge} settled={winnerId !== null} />

        <motion.div
          className="flex justify-start"
          initial={reduce ? false : { x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        >
          <ArcadeCard game={right} state={stateFor(right)} onSelect={() => pick(right, left)} />
        </motion.div>
      </div>

      <p className="mt-5 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted">
        Tap the winner
      </p>
    </div>
  );
}

function Seam({ badge, settled }: { badge?: React.ReactNode; settled: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex h-full min-h-[7rem] w-10 items-center justify-center sm:w-14">
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'linear-gradient(to bottom, rgb(var(--color-teal)), rgb(var(--color-accent)), rgb(var(--color-coin)))',
          opacity: settled ? 0.4 : 0.85,
        }}
      />
      <AnimatePresence mode="wait">
        <motion.span
          key={badge ? 'badge' : 'vs'}
          className={cn(
            'relative z-10 flex items-center justify-center rounded-tile border border-border bg-bg font-display font-black uppercase shadow-cabinet',
            badge ? 'px-2 py-1 text-[0.6rem] tracking-[0.1em] text-accent' : 'h-10 w-10 rotate-[-8deg] text-sm tracking-[0.05em] text-fg',
          )}
          initial={reduce ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18, delay: reduce ? 0 : 0.12 }}
        >
          {badge ?? 'VS'}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
