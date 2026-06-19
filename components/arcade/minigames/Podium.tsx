'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import type { RankingOutcome } from '@/lib/ranking';
import { cn } from '@/lib/utils';

import { Button } from '../../ui/Button';
import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';

/** Podium steps: 1st in the middle and tallest, then 2nd, then 3rd. Rendered left→right as 2/1/3. */
const STEPS = [
  { rank: 1, label: '1st', height: 'h-20', medal: '🥇', accent: 'text-coin', order: 'order-2' },
  { rank: 2, label: '2nd', height: 'h-14', medal: '🥈', accent: 'text-muted', order: 'order-1' },
  { rank: 3, label: '3rd', height: 'h-10', medal: '🥉', accent: 'text-accent', order: 'order-3' },
] as const;

/**
 * Minigame — "Podium." Pick and order your top three from the group; everything else is the rest.
 * Tap covers in best-first order to raise them onto the podium, tap a podium card to send it back.
 * Emits the ordered top three plus a pick-of-the-rest, so the engine learns both the order and that
 * all three beat the field.
 */
export function Podium({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [ranked, setRanked] = useState<Game[]>([]);

  if (games.length < 3) return null;

  const full = ranked.length === 3;
  const isRanked = (g: Game) => ranked.some((r) => r.igdbId === g.igdbId);
  const pool = games.filter((g) => !isRanked(g));

  const promote = (game: Game) => {
    if (full || isRanked(game)) return;
    playSound('blip');
    setRanked((prev) => [...prev, game]);
  };

  const demote = (game: Game) => {
    playSound('click');
    setRanked((prev) => prev.filter((r) => r.igdbId !== game.igdbId));
  };

  const lockIn = () => {
    if (!full) return;
    playSound('success');
    const top = ranked.map((g) => g.igdbId);
    const rest = pool.map((g) => g.igdbId);
    const outcomes: RankingOutcome[] = [{ type: 'lineup', orderedIds: top }];
    if (rest.length > 0) outcomes.push({ type: 'pick-k-of-n', pickedIds: top, rejectedIds: rest });
    complete(outcomes);
  };

  return (
    <div className="flex flex-col items-center">
      <header className="mb-6 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.28em] text-coin">Podium</p>
        <h2 className="font-display text-3xl font-black uppercase tracking-[0.02em] text-fg sm:text-4xl">
          Crown your top three.
        </h2>
        <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted">
          {full ? 'Tap a card to redo — or lock it in' : 'Tap in order — gold first'}
        </p>
      </header>

      {/* Podium */}
      <div className="flex items-end justify-center gap-3">
        {STEPS.map((step) => {
          const game = ranked[step.rank - 1];
          return (
            <div key={step.rank} className={cn('flex flex-col items-center gap-2', step.order)}>
              <div className="flex h-[148px] items-end">
                {game ? (
                  <motion.button
                    type="button"
                    layout
                    initial={{ y: 24, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 24 }}
                    aria-label={`Remove ${game.title} from ${step.label}`}
                    onClick={() => demote(game)}
                    className="rounded-tile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ArcadeCard game={game} size="sm" state="win" badge={step.medal} />
                  </motion.button>
                ) : (
                  <div className="flex aspect-[3/4] w-[104px] items-center justify-center rounded-tile border border-dashed border-border/70 bg-surface/20 text-2xl">
                    {step.medal}
                  </div>
                )}
              </div>
              <div
                className={cn(
                  'flex w-[104px] items-center justify-center rounded-t-tile border border-border bg-surface/40',
                  step.height,
                )}
              >
                <span className={cn('font-display text-xl font-black uppercase', step.accent)}>
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pool of remaining covers, or the lock-in once three are chosen. */}
      <div className="mt-7 flex min-h-[150px] w-full max-w-2xl flex-wrap justify-center gap-3 border-t border-border pt-5">
        {full ? (
          <Button onClick={lockIn} disabled={!full}>
            Lock in podium →
          </Button>
        ) : (
          pool.map((g) => (
            <motion.div key={g.igdbId} layout>
              <ArcadeCard game={g} size="sm" onSelect={() => promote(g)} />
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
