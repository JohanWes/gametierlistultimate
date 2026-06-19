'use client';

import { useState } from 'react';

import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

import { tapProps, useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';

type Answer = 'immediately' | 'maybe' | 'probably-not' | 'never';

const ANSWERS: { answer: Answer; label: string; tone: string }[] = [
  { answer: 'immediately', label: 'Yes', tone: 'border-teal bg-teal/15 text-teal hover:bg-teal/25' },
  { answer: 'maybe', label: 'Maybe', tone: 'border-accent/60 bg-accent/12 text-accent hover:bg-accent/20' },
  { answer: 'probably-not', label: 'Probably not', tone: 'border-border bg-surface-elevated text-fg hover:border-coin/50' },
  { answer: 'never', label: 'Never', tone: 'border-coin/60 bg-coin/12 text-coin hover:bg-coin/22' },
];

/** Minigame 10 — "Would you replay this?" A single game, four verdicts. Supporting signal. */
export function ReplayTest({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [chosen, setChosen] = useState<Answer | null>(null);
  const game = games[0];
  if (!game) return null;

  const decide = (answer: Answer) => {
    if (chosen !== null) return;
    setChosen(answer);
    playSound(answer === 'immediately' ? 'reveal' : 'click');
    complete([{ type: 'replay', gameId: game.igdbId, answer }]);
  };

  return (
    <div className="flex flex-col items-center">
      <header className="mb-6 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.28em] text-teal">Replay test</p>
        <h2 className="font-display text-3xl font-black uppercase tracking-[0.02em] text-fg sm:text-4xl">
          Would you replay this?
        </h2>
      </header>

      <ArcadeCard game={game} state={chosen === 'immediately' ? 'win' : 'idle'} />

      <div className="mt-7 grid w-full max-w-md grid-cols-2 gap-2.5">
        {ANSWERS.map(({ answer, label, tone }) => (
          <button
            key={answer}
            type="button"
            disabled={chosen !== null}
            {...tapProps(() => decide(answer))}
            className={cn(
              'select-none rounded-tile border px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.06em] transition-colors duration-150 focus-visible:outline-none disabled:opacity-50',
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
