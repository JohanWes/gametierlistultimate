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
  /** Hide the title overlay when a parent surface provides its own cover treatment. */
  showTitle?: boolean;
  /** When provided the card becomes an interactive button. */
  onSelect?: (game: Game) => void;
  /** Visual size of the card. */
  size?: GameCardSize;
  className?: string;
}

export type GameCardSize = keyof typeof SIZES;

const SIZES = {
  sm: 'w-[104px]',
  md: 'w-[150px]',
  lg: 'w-[220px]',
  // Arcade tokens: viewport-responsive widths (see --cover-* in app/globals.css).
  row: 'w-[var(--cover-row)]',
  duo: 'w-[var(--cover-duo)]',
  zone: 'w-[var(--cover-zone)]',
  solo: 'w-[var(--cover-solo)]',
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
  showTitle = true,
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
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-elevated p-3 text-center">
          <span className="font-display text-sm font-semibold leading-tight text-fg/90">
            {game.title}
          </span>
        </div>
      )}
      {showCover && showTitle ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 min-h-[28%] bg-gradient-to-t from-black/95 via-black/70 via-45% to-transparent p-2 pt-8">
          <span className="line-clamp-2 text-xs font-semibold leading-tight text-fg drop-shadow-[0_2px_3px_rgb(0_0_0/0.95)]">
            {game.title}
          </span>
        </div>
      ) : null}
    </>
  );

  const classes = cn(
    'group relative block aspect-[3/4] shrink-0 overflow-hidden rounded-tile bg-surface',
    'border transition-colors duration-150',
    selected ? 'border-accent shadow-cabinet' : 'border-border shadow-soft',
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
      className={cn(classes, 'cursor-pointer hover:border-teal/70 focus-visible:outline-none')}
    >
      {inner}
    </motion.button>
  );
}
