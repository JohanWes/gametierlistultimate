'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { type PlayedStatus, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import { GameCard } from '../ui/GameCard';

export type PoolDecision = 'include' | 'reject' | 'skip';

export interface PoolCardProps {
  game: Game;
  /** Occasionally true — turns the include action into a quick "how much did you play it?" pick. */
  spotlight?: boolean;
  onDecide: (action: PoolDecision) => void;
}

/** Fire a handler on both mouse click and touch, without the synthesized double-fire. */
function tapProps(handler: () => void) {
  return {
    onClick: handler,
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      handler();
    },
  };
}

const STATUS_OPTIONS: { status: PlayedStatus; label: string }[] = [
  { status: 'tried', label: 'Tried briefly' },
  { status: 'finished', label: 'Finished' },
  { status: 'played-a-lot', label: 'Played a lot' },
];

/**
 * One candidate game in the pool-building batch: a cover, a quick fact line, and large
 * tap targets. Most includes are a single tap; a `spotlight` card instead reveals a small
 * played-status picker — a sprinkled bonus, where "Played a lot" gets a short celebration and
 * seeds a stronger starting score for the ranking phase.
 */
export function PoolCard({ game, spotlight = false, onDecide }: PoolCardProps) {
  const reduce = useReducedMotion();
  const addToPool = useStore((s) => s.addToPool);
  const [picking, setPicking] = useState(false);

  const facts = [
    game.releaseYear ? String(game.releaseYear) : null,
    game.genres[0] ?? null,
  ].filter(Boolean) as string[];

  const include = (status: PlayedStatus) => {
    addToPool(game, status);
    playSound(status === 'played-a-lot' ? 'reveal' : 'success');
    onDecide('include');
  };

  const onPlayed = () => {
    if (spotlight) {
      playSound('blip');
      setPicking(true);
      return;
    }
    include('finished');
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.33, 1, 0.68, 1] }}
      className={cn(
        'relative flex flex-col items-center gap-3 rounded-card border bg-surface p-4 shadow-cabinet',
        spotlight ? 'border-accent/70' : 'border-border',
      )}
    >
      {spotlight ? (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-hardware border border-accent bg-bg px-2 py-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.2em] text-accent shadow-soft">
          ★ Spotlight
        </span>
      ) : null}

      <GameCard game={game} />

      <div className="min-h-[2.5rem] text-center">
        <p className="line-clamp-2 font-display text-sm font-bold uppercase leading-tight tracking-[0.02em] text-fg">
          {game.title}
        </p>
        {facts.length ? (
          <p className="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted">
            {facts.join(' · ')}
          </p>
        ) : null}
      </div>

      {picking ? (
        <motion.div
          key="picker"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex w-full flex-col gap-1.5"
        >
          <p className="text-center font-mono text-[0.62rem] uppercase tracking-[0.18em] text-teal">
            How much did you play it?
          </p>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.status}
              type="button"
              {...tapProps(() => include(opt.status))}
              className={cn(
                'select-none rounded-tile border px-3 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none',
                opt.status === 'played-a-lot'
                  ? 'border-accent/60 bg-accent/12 text-accent hover:bg-accent/20'
                  : 'border-border bg-surface-elevated text-fg hover:border-teal/60',
              )}
            >
              {opt.label}
            </button>
          ))}
        </motion.div>
      ) : (
        <div className="flex w-full flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                {...tapProps(() => {
                  playSound('click');
                  onDecide('reject');
                })}
                className="select-none rounded-tile border border-border bg-surface-elevated px-3 py-2.5 text-sm font-bold uppercase tracking-[0.04em] text-muted transition-colors duration-150 hover:border-coin/70 hover:text-fg focus-visible:outline-none"
              >
                ✕ Pass
              </button>
              <button
                type="button"
                {...tapProps(onPlayed)}
                className="select-none rounded-tile border border-teal bg-teal/15 px-3 py-2.5 text-sm font-bold uppercase tracking-[0.04em] text-teal transition-colors duration-150 hover:bg-teal/25 focus-visible:outline-none"
              >
                ✓ Played it
              </button>
            </div>
            <button
              type="button"
              {...tapProps(() => {
                playSound('blip');
                onDecide('skip');
              })}
              className="select-none rounded-tile px-3 py-1.5 text-xs font-medium text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-none"
            >
              Not sure — skip
            </button>
          </div>
        )}
    </motion.div>
  );
}
