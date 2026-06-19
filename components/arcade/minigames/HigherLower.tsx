'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import type { RankingOutcome } from '@/lib/ranking';
import { cn } from '@/lib/utils';

import { tapProps, useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';

type Verdict = 'better' | 'worse' | 'equal' | 'skip';

const VERDICTS: { verdict: Verdict; label: string; tone: string }[] = [
  { verdict: 'better', label: 'Better', tone: 'border-teal bg-teal/15 text-teal hover:bg-teal/25' },
  { verdict: 'worse', label: 'Worse', tone: 'border-coin bg-coin/15 text-coin hover:bg-coin/25' },
  { verdict: 'equal', label: 'About equal', tone: 'border-border bg-surface-elevated text-fg hover:border-accent/60' },
  { verdict: 'skip', label: 'Skip', tone: 'border-transparent text-muted hover:text-fg' },
];

/**
 * Minigame 6 — "Better or worse than the benchmark?" Tap-friendly verdict buttons that map onto
 * a pairwise win, an about-equal nudge, or a skip.
 */
export function HigherLower({ games, anchorId, onComplete }: MinigameProps) {
  const reduce = useReducedMotion();
  const complete = useComplete(onComplete);
  const [chosen, setChosen] = useState<Verdict | null>(null);

  if (games.length < 2) return null;
  const anchor = games.find((g) => g.igdbId === anchorId) ?? games[0];
  const challenger = games.find((g) => g.igdbId !== anchor.igdbId) ?? games[1];

  const decide = (verdict: Verdict) => {
    if (chosen !== null) return;
    setChosen(verdict);
    playSound(verdict === 'skip' ? 'click' : 'success');

    const ids: [number, number] = [challenger.igdbId, anchor.igdbId];
    const outcome: RankingOutcome =
      verdict === 'better'
        ? { type: 'pairwise', winnerId: challenger.igdbId, loserId: anchor.igdbId }
        : verdict === 'worse'
          ? { type: 'pairwise', winnerId: anchor.igdbId, loserId: challenger.igdbId }
          : verdict === 'equal'
            ? { type: 'about-equal', gameIds: ids }
            : { type: 'skip', gameIds: ids };
    complete([outcome]);
  };

  return (
    <div className="flex flex-col items-center">
      <header className="mb-6 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.28em] text-teal">Higher or lower</p>
        <h2 className="font-display text-3xl font-black uppercase tracking-[0.02em] text-fg sm:text-4xl">
          How does it stack up?
        </h2>
      </header>

      <div className="flex items-center gap-5 sm:gap-8">
        <Benchmark game={anchor} />
        <span className="font-display text-2xl font-black text-muted">vs</span>
        <motion.div
          initial={reduce ? false : { scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 24 }}
        >
          <ArcadeCard game={challenger} state={chosen && chosen !== 'skip' ? 'win' : 'idle'} />
        </motion.div>
      </div>

      <div className="mt-7 grid w-full max-w-md grid-cols-2 gap-2.5">
        {VERDICTS.map(({ verdict, label, tone }) => (
          <button
            key={verdict}
            type="button"
            disabled={chosen !== null}
            {...tapProps(() => decide(verdict))}
            className={cn(
              'select-none rounded-tile border px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.06em] transition-colors duration-150 focus-visible:outline-none disabled:opacity-50',
              verdict === 'skip' && 'col-span-2',
              tone,
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Benchmark({ game }: { game: Game }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="rounded-hardware border border-accent/60 bg-accent/10 px-2.5 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.18em] text-accent">
        Benchmark
      </span>
      <ArcadeCard game={game} state="dim" />
    </div>
  );
}
