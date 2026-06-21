'use client';

import { motion, useReducedMotion } from 'framer-motion';

import type { Game } from '@/lib/games/types';
import { type PoolDecision, STATUS_OPTIONS, usePoolDecision } from '@/lib/pool-decision';
import { cn } from '@/lib/utils';

import { GameCard } from '../ui/GameCard';

export type { PoolDecision } from '@/lib/pool-decision';

export interface PoolCardProps {
  game: Game;
  /** Injected RNG in [0, 1); defaults to Math.random. */
  random?: () => number;
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

/**
 * One candidate game in the pool-building batch: the cover is the whole decision surface,
 * with compact actions docked over the art. Most "Played it" taps include immediately; a random
 * minority (SPOTLIGHT_CHANCE) instead reveals a small played-status picker — a sprinkled bonus,
 * where "Played a lot" gets a short celebration and seeds a stronger starting score for the
 * ranking phase. The trigger is rolled only on a "Played it" tap, so it never fires on a game the
 * user passed on.
 */
export function PoolCard({ game, random = Math.random, onDecide }: PoolCardProps) {
  const reduce = useReducedMotion();
  const { picking, playedRollHits, reject, chooseStatus } = usePoolDecision({
    game,
    random,
    onDecide,
  });
  const hasCover = game.hasCover && !!game.coverUrl;

  const onPlayed = () => {
    if (!playedRollHits()) chooseStatus('finished');
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.33, 1, 0.68, 1] }}
      className={cn(
        'relative mx-auto w-full max-w-[22rem] overflow-hidden rounded-card border bg-surface shadow-cabinet',
        'border-border',
      )}
    >
      <div className="relative">
        <GameCard game={game} showTitle={false} size="lg" className="w-full rounded-none border-0 shadow-none" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[36%] bg-gradient-to-t from-black/95 via-black/72 via-45% to-transparent"
        />

        {hasCover ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 px-3 text-center">
            <p className="line-clamp-2 text-xs font-semibold leading-tight text-fg drop-shadow-[0_2px_3px_rgb(0_0_0/0.95)]">
              {game.title}
            </p>
          </div>
        ) : null}

      </div>

      {picking ? (
        <motion.div
          key="picker"
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-1.5 border-t border-border/70 bg-surface px-3 py-3"
        >
          <span className="self-center rounded-hardware border border-accent/70 bg-black/70 px-2 py-0.5 font-mono text-[0.58rem] font-bold uppercase tracking-[0.18em] text-accent shadow-soft backdrop-blur-sm">
            ★ Spotlight
          </span>
          <p className="text-center font-mono text-[0.62rem] uppercase tracking-[0.18em] text-teal">
            How much did you play it?
          </p>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.status}
              type="button"
              {...tapProps(() => chooseStatus(opt.status))}
              className={cn(
                'select-none rounded-tile border px-3 py-1.5 text-sm font-semibold shadow-soft transition-colors duration-150 focus-visible:outline-none',
                opt.status === 'played-a-lot'
                  ? 'border-accent/70 bg-accent/12 text-accent hover:bg-accent/20'
                  : 'border-border bg-surface-elevated text-fg hover:border-teal/60',
              )}
            >
              {opt.label}
            </button>
          ))}
        </motion.div>
      ) : (
        <div className="border-t border-border/70 bg-surface px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              {...tapProps(reject)}
              className="flex select-none items-center justify-center gap-2 rounded-tile border border-border bg-surface-elevated px-3 py-2 font-display text-sm font-black uppercase tracking-[0.1em] text-muted shadow-soft transition-colors duration-150 hover:border-coin/70 hover:text-fg focus-visible:outline-none"
            >
              <span aria-hidden className="text-xl leading-none text-coin">
                ✕
              </span>
              <span>Pass</span>
            </button>
            <button
              type="button"
              {...tapProps(onPlayed)}
              className="flex select-none items-center justify-center gap-2 rounded-tile border border-teal/65 bg-teal/12 px-3 py-2 font-display text-sm font-black uppercase tracking-[0.1em] text-fg shadow-soft transition-colors duration-150 hover:bg-teal/20 focus-visible:outline-none"
            >
              <span aria-hidden className="text-xl leading-none text-tier-c">
                ✓
              </span>
              <span>Played it</span>
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
