'use client';

import { motion, useReducedMotion } from 'framer-motion';

import type { Game } from '@/lib/games/types';
import { cn } from '@/lib/utils';

import { GameCard, type GameCardSize } from '../../ui/GameCard';
import { RemoveButton } from '../../ui/RemoveButton';
import { useRemoveGame } from '../RemoveGameContext';
import { tapProps } from '../shared';

export type CardState = 'idle' | 'win' | 'lose' | 'dim' | 'equal';

export interface ArcadeCardProps {
  game: Game;
  state?: CardState;
  size?: GameCardSize;
  /** A rank chip, crown, or other marker pinned to the corner. */
  badge?: React.ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  className?: string;
  /**
   * Custom glow color (any CSS color string, e.g. `rgb(130 224 122 / 0.55)`). When provided and
   * `state` is `win`, the highlight overlay uses this color for its boxShadow + ring instead of
   * the default accent. Used by the vibe-meter to tint the glow from red→yellow→green based on
   * the player's 0-100 rating. Backward compatible: omitted by all other minigames.
   */
  glowColor?: string;
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
  glowColor,
}: ArcadeCardProps) {
  const reduce = useReducedMotion();
  const interactive = typeof onSelect === 'function' && !disabled;
  const onRemove = useRemoveGame();

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
          className={cn(
            'pointer-events-none absolute inset-0 rounded-tile ring-2',
            glowColor ? 'ring-transparent' : 'ring-accent',
          )}
          style={
            glowColor
              ? { boxShadow: `0 0 30px ${glowColor}, 0 0 0 2px ${glowColor}` }
              : { boxShadow: '0 0 30px rgb(var(--color-accent) / 0.55)' }
          }
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

  const removeX = onRemove ? (
    <RemoveButton onClick={() => onRemove(game)} title={game.title} />
  ) : null;

  if (!interactive) {
    return (
      <div className={cn('relative inline-flex', className)}>
        {frame}
        {removeX}
      </div>
    );
  }

  return (
    <div className={cn('relative inline-flex', className)}>
      <motion.button
        type="button"
        title={game.title}
        {...tapProps(onSelect)}
        whileHover={reduce ? undefined : { y: -6 }}
        whileTap={reduce ? undefined : { scale: 0.94 }}
        animate={state === 'win' && !reduce ? { scale: 1.05 } : { scale: 1 }}
        transition={{ type: 'spring', stiffness: 460, damping: 26 }}
        className="inline-flex cursor-pointer focus-visible:outline-none"
      >
        {frame}
      </motion.button>
      {removeX}
    </div>
  );
}
