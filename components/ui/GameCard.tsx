'use client';

import { motion, useReducedMotion } from 'framer-motion';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

export interface GameCardProps {
  game?: Game;
  /** Show the loading skeleton instead of content. */
  loading?: boolean;
  selected?: boolean;
  /** When provided the card becomes an interactive button. */
  onSelect?: (game: Game) => void;
  /** Visual size of the card. */
  size?: 'sm' | 'md';
  className?: string;
}

const SIZES = {
  sm: 'w-[104px]',
  md: 'w-[150px]',
} as const;

/**
 * Cover-forward game card. Shows a shimmer skeleton while loading, a graceful
 * title-on-gradient fallback when there is no cover, and fires `onSelect` on both
 * click and touch.
 */
export function GameCard({
  game,
  loading = false,
  selected = false,
  onSelect,
  size = 'md',
  className,
}: GameCardProps) {
  const reduce = useReducedMotion();

  if (loading || !game) {
    return (
      <div
        data-testid="game-card-skeleton"
        aria-hidden
        className={cn(
          'relative aspect-[3/4] overflow-hidden rounded-tile bg-surface-elevated',
          SIZES[size],
          className,
        )}
      >
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-fg/10 to-transparent" />
      </div>
    );
  }

  const interactive = typeof onSelect === 'function';
  const showCover = game.hasCover && !!game.coverUrl;

  const select = () => {
    if (!interactive) return;
    playSound('blip');
    onSelect?.(game);
  };

  const inner = (
    <>
      {showCover ? (
        // Covers come from many IGDB hosts; a plain img avoids per-domain next/image config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={game.coverUrl ?? undefined}
          alt={game.title}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-elevated to-surface p-3 text-center">
          <span className="font-display text-sm font-semibold leading-tight text-fg/90">
            {game.title}
          </span>
        </div>
      )}
      {showCover ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-2 pt-6">
          <span className="line-clamp-2 text-xs font-medium leading-tight text-fg">{game.title}</span>
        </div>
      ) : null}
    </>
  );

  const classes = cn(
    'group relative block aspect-[3/4] shrink-0 overflow-hidden rounded-tile bg-surface',
    'border transition-colors duration-150',
    selected ? 'border-accent shadow-glow' : 'border-border',
    SIZES[size],
    className,
  );

  if (!interactive) {
    return (
      <div className={classes} title={game.title}>
        {inner}
      </div>
    );
  }

  return (
    <motion.button
      type="button"
      title={game.title}
      whileHover={reduce ? undefined : { y: -4 }}
      whileTap={reduce ? undefined : { scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      onClick={select}
      onTouchEnd={(e) => {
        // Prevent the synthesized click so a real touch doesn't fire onSelect twice.
        e.preventDefault();
        select();
      }}
      className={cn(classes, 'cursor-pointer hover:border-accent/70 focus-visible:outline-none')}
    >
      {inner}
    </motion.button>
  );
}
