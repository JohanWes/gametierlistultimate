'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import { playSound } from '@/lib/sound';
import type { RankingOutcome } from '@/lib/ranking';
import { cn } from '@/lib/utils';

import { tapProps, useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';

/**
 * Minigame 7 — "How far does this game climb?" One challenger faces progressively stronger
 * opponents one at a time. Each tap decides a bout: a win climbs to the next rung, a loss ends
 * the run. Emits the pairwise outcomes actually played.
 */
export function Gauntlet({ games, onComplete }: MinigameProps) {
  const reduce = useReducedMotion();
  const complete = useComplete(onComplete);
  const [challenger, ...opponents] = games;
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<RankingOutcome[]>([]);
  const [stopped, setStopped] = useState(false);

  if (!challenger || opponents.length === 0) return null;
  const current = opponents[step];

  const decide = (challengerWins: boolean) => {
    if (stopped) return;
    const opponent = opponents[step];
    const outcome: RankingOutcome = challengerWins
      ? { type: 'pairwise', winnerId: challenger.igdbId, loserId: opponent.igdbId }
      : { type: 'pairwise', winnerId: opponent.igdbId, loserId: challenger.igdbId };
    const next = [...results, outcome];
    setResults(next);

    const climbedOut = challengerWins && step + 1 >= opponents.length;
    if (!challengerWins || climbedOut) {
      setStopped(true);
      playSound(challengerWins ? 'reveal' : 'click');
      complete(next);
    } else {
      playSound('success');
      setStep(step + 1);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <header className="mb-6 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.28em] text-accent">The gauntlet</p>
        <h2 className="font-display text-3xl font-black uppercase tracking-[0.02em] text-fg sm:text-4xl">
          How far does it climb?
        </h2>
      </header>

      <div className="flex items-center gap-4 sm:gap-7">
        <div className="flex flex-col items-center gap-2">
          <span className="rounded-hardware border border-accent/60 bg-accent/10 px-2.5 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.18em] text-accent">
            Challenger
          </span>
          <ArcadeCard game={challenger} state={stopped ? 'idle' : 'win'} />
        </div>

        <span className="font-display text-2xl font-black text-muted">vs</span>

        <div className="flex flex-col items-center gap-2">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            Round {step + 1} / {opponents.length}
          </span>
          <AnimatePresence mode="wait">
            <motion.div
              key={current.igdbId}
              initial={reduce ? false : { x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { x: -30, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
              <ArcadeCard game={current} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Ladder of rungs cleared. */}
      <div className="mt-5 flex items-center gap-1.5">
        {opponents.map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-2 w-7 rounded-full transition-colors',
              i < step ? 'bg-accent' : i === step && !stopped ? 'bg-teal' : 'bg-border',
            )}
          />
        ))}
      </div>

      <div className="mt-6 grid w-full max-w-md grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={stopped}
          {...tapProps(() => decide(true))}
          className="select-none rounded-tile border border-teal bg-teal/15 px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-teal transition-colors duration-150 hover:bg-teal/25 focus-visible:outline-none disabled:opacity-50"
        >
          Keeps climbing
        </button>
        <button
          type="button"
          disabled={stopped}
          {...tapProps(() => decide(false))}
          className="select-none rounded-tile border border-coin bg-coin/15 px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-coin transition-colors duration-150 hover:bg-coin/25 focus-visible:outline-none disabled:opacity-50"
        >
          Stops here
        </button>
      </div>
    </div>
  );
}
