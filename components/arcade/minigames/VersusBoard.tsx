'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

import { ArcadeCard, type CardState } from './ArcadeCard';
import { MinigameHeader } from './MinigameHeader';

interface VersusBoardProps {
  left: Game;
  right: Game;
  prompt: string;
  /** Small kicker above the prompt, e.g. "Settle the rivalry". */
  eyebrow?: string;
  onPick: (winner: Game, loser: Game) => void;
}

/**
 * The arcade's signature face-off: two covers slam in from opposite edges, split by a glowing
 * tier-spectrum seam with a "VS" chip. Tapping a cover crowns it (glow + scale) and dims the
 * loser. Used by Duel (and so Rivalry/promotion rounds). Manages only the local win/lose visual;
 * the wrapper decides what outcome the pick means.
 */
export function VersusBoard({ left, right, prompt, eyebrow, onPick }: VersusBoardProps) {
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
          <ArcadeCard game={left} size="duo" state={stateFor(left)} onSelect={() => pick(left, right)} />
        </motion.div>

        <Seam settled={winnerId !== null} />

        <motion.div
          className="flex justify-start"
          initial={reduce ? false : { x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        >
          <ArcadeCard game={right} size="duo" state={stateFor(right)} onSelect={() => pick(right, left)} />
        </motion.div>
      </div>

      <p className="mt-5 font-mono text-[0.78rem] font-bold uppercase tracking-[0.2em] text-teal">
        Tap the winner
      </p>
    </div>
  );
}

function Seam({ settled }: { settled: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex h-full min-h-[7rem] w-10 items-center justify-center sm:w-14">
      <motion.span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full"
        style={{
          background:
            'linear-gradient(to bottom, rgb(var(--color-teal)), rgb(var(--color-accent)), rgb(var(--color-coin)))',
        }}
        initial={false}
        animate={
          settled ? { opacity: 0.4 } : reduce ? { opacity: 0.85 } : { opacity: [0.7, 1, 0.7] }
        }
        transition={
          settled || reduce
            ? { duration: 0.3 }
            : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
        }
      />
      {/* The seam's glow: a static shadow whose opacity pulses, so the loop never repaints. */}
      <motion.span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full shadow-[0_0_22px_rgb(var(--color-accent)/0.65)]"
        initial={{ opacity: 0 }}
        animate={settled || reduce ? { opacity: 0 } : { opacity: [0.4, 1, 0.4] }}
        transition={
          settled || reduce
            ? { duration: 0.3 }
            : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
        }
      />
      <motion.span
        className={cn(
          'relative z-10 flex h-11 w-11 rotate-[-8deg] items-center justify-center rounded-tile border border-border bg-bg font-display text-base font-black uppercase tracking-[0.05em] text-fg shadow-cabinet',
          !settled && 'drop-shadow-[0_0_12px_rgb(var(--color-accent)/0.55)]',
        )}
        initial={reduce ? false : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18, delay: reduce ? 0 : 0.12 }}
      >
        VS
      </motion.span>
    </div>
  );
}
