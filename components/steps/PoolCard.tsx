'use client';

import { motion, useReducedMotion } from 'framer-motion';

import type { Game } from '@/lib/games/types';
import { type PoolDecision, STATUS_OPTIONS, usePoolDecision } from '@/lib/pool-decision';
import { tapProps } from '@/lib/tap';
import { cn } from '@/lib/utils';

import { GameCard } from '../ui/GameCard';

export type { PoolDecision } from '@/lib/pool-decision';

export interface PoolCardProps {
  game: Game;
  /** Injected RNG in [0, 1); defaults to Math.random. */
  random?: () => number;
  onDecide: (action: PoolDecision) => void;
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
      whileHover={reduce ? undefined : { y: -5 }}
      transition={reduce ? { duration: 0 } : { duration: 0.18, ease: [0.33, 1, 0.68, 1] }}
      className={cn(
        'group relative mx-auto w-[var(--cover-pool)] overflow-hidden rounded-card border-2 bg-surface shadow-cabinet',
        'border-border transition-[border-color,box-shadow] duration-200 hover:border-accent/40 hover:shadow-lift',
      )}
    >
      <div className="relative">
        <GameCard game={game} showTitle={false} size="pool" className="w-full rounded-none border-0 shadow-none" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[36%] bg-gradient-to-t from-black/95 via-black/72 via-45% to-transparent"
        />

        {hasCover ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 px-4 text-center">
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-fg drop-shadow-[0_2px_3px_rgb(0_0_0/0.95)]">
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
        <div className="border-t-2 border-black/50 bg-panel px-3 py-3 shadow-[inset_0_1px_0_rgb(var(--color-fg)/0.05)]">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              {...tapProps(reject)}
              className="group/btn flex select-none items-center justify-center gap-2 rounded-control border-2 border-border bg-surface-elevated px-3 py-2.5 font-display text-sm font-black uppercase tracking-[0.1em] text-muted shadow-soft transition-colors duration-150 hover:border-coin/70 hover:bg-coin/15 hover:text-fg focus-visible:outline-none active:translate-y-px"
            >
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-hardware border border-coin/60 bg-coin/15 text-base leading-none text-coin transition-colors duration-150 group-hover/btn:bg-coin/25"
              >
                ✕
              </span>
              <span>Pass</span>
            </button>
            <button
              type="button"
              {...tapProps(onPlayed)}
              className="group/btn flex select-none items-center justify-center gap-2 rounded-control border-2 border-teal/65 bg-teal/12 px-3 py-2.5 font-display text-sm font-black uppercase tracking-[0.1em] text-fg shadow-soft transition-colors duration-150 hover:border-teal hover:bg-teal/22 focus-visible:outline-none active:translate-y-px"
            >
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-hardware border border-teal/60 bg-teal/15 text-base leading-none text-tier-c transition-colors duration-150 group-hover/btn:bg-teal/25"
              >
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
