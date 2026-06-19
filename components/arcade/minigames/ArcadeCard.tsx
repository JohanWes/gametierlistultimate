'use client';

import { motion, useReducedMotion } from 'framer-motion';

import type { Game } from '@/lib/games/types';
import { cn } from '@/lib/utils';

import { GameCard } from '../../ui/GameCard';
import { tapProps } from '../shared';

export type CardState = 'idle' | 'win' | 'lose' | 'dim' | 'equal';

export interface ArcadeCardProps {
  game: Game;
  state?: CardState;
  size?: 'sm' | 'md';
  /** A rank chip, crown, or other marker pinned to the corner. */
  badge?: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Cover-forward card for the arcade. Wraps the display-only GameCard and layers on the
 * minigame win / eliminate / dim states plus a corner badge. Interactive when `onSelect` is
 * given, firing on both click and touch.
 */
export function ArcadeCard({
  game,
  state = 'idle',
  size = 'md',
  badge,
  onSelect,
  disabled = false,
  className,
}: ArcadeCardProps) {
  const reduce = useReducedMotion();
  const interactive = typeof onSelect === 'function' && !disabled;

  const frame = (
    <span
      className={cn(
        'relative inline-flex rounded-tile transition-[filter,opacity] duration-200',
        state === 'lose' && 'opacity-45 grayscale',
        state === 'dim' && 'opacity-40',
      )}
    >
      <GameCard game={game} size={size} />

      {state === 'win' ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-tile ring-2 ring-accent"
          style={{ boxShadow: '0 0 30px rgb(var(--color-accent) / 0.55)' }}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      ) : null}

      {state === 'equal' ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-tile ring-2 ring-teal/70"
          style={{ boxShadow: '0 0 22px rgb(var(--color-teal) / 0.35)' }}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      ) : null}

      {badge ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -left-2 -top-2 z-10 flex h-7 min-w-7 items-center justify-center rounded-hardware border border-border bg-bg px-1.5 font-display text-sm font-black leading-none text-accent shadow-soft"
        >
          {badge}
        </span>
      ) : null}
    </span>
  );

  if (!interactive) {
    return <div className={cn('inline-flex', className)}>{frame}</div>;
  }

  return (
    <motion.button
      type="button"
      title={game.title}
      {...tapProps(onSelect)}
      whileHover={reduce ? undefined : { y: -6 }}
      whileTap={reduce ? undefined : { scale: 0.94 }}
      animate={state === 'win' && !reduce ? { scale: 1.05 } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 460, damping: 26 }}
      className={cn('inline-flex cursor-pointer focus-visible:outline-none', className)}
    >
      {frame}
    </motion.button>
  );
}
