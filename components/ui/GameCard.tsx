'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';

import { sharpenIgdbCoverUrl } from '@/lib/games/normalize';
import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import { tapProps } from '@/lib/tap';
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
  /** Extra classes merged onto the cover `<img>` (e.g. a parent-driven hover zoom). */
  imageClassName?: string;
  /**
   * Load the cover eagerly with high priority. Defaults to lazy — fine for dense grids and
   * below-the-fold rows. Set `eager` for always-visible hero slots (pool builder) where a
   * lazy load would add an intersection-check tick before the image decodes.
   */
  eager?: boolean;
}

export type GameCardSize = keyof typeof SIZES;

const SIZES = {
  sm: 'w-[104px]',
  md: 'w-[150px]',
  lg: 'w-[220px]',
  // Pool builder (Step 3): viewport-responsive large boxart (see --cover-pool in app/globals.css).
  pool: 'w-[var(--cover-pool)]',
  // Arcade tokens: viewport-responsive widths (see --cover-* in app/globals.css).
  row: 'w-[var(--cover-row)]',
  duo: 'w-[var(--cover-duo)]',
  zone: 'w-[var(--cover-zone)]',
  lineup: 'w-[var(--cover-lineup)]',
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
  imageClassName,
  eager = false,
}: GameCardProps) {
  const reduce = useReducedMotion();
  // Covers stream in top-to-bottom; revealing the <img> only once it has fully decoded avoids a
  // half-painted bottom edge flashing during a card's spawn animation. Cached/warmed covers report
  // `complete` immediately via the ref, so they appear instantly with no flash.
  const [loaded, setLoaded] = useState(false);

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
  const coverUrl = game.coverUrl ? sharpenIgdbCoverUrl(game.coverUrl) : null;

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
          // Catch covers already decoded before React attached `onLoad` (warm prefetch cache),
          // and re-arm the gate when the same element is reused for a different cover.
          ref={(el) => setLoaded(!!el?.complete && el.naturalWidth > 0)}
          key={coverUrl}
          src={coverUrl ?? undefined}
          alt={game.title}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onLoad={() => setLoaded(true)}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          decoding="async"
          className={cn(
            'h-full w-full object-cover',
            !reduce && 'transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
            imageClassName,
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-elevated p-3 text-center">
          <span className="font-display text-sm font-semibold leading-tight text-fg/90">
            {game.title}
          </span>
        </div>
      )}
      {showCover && showTitle ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[36%] bg-gradient-to-t from-black/95 via-black/72 via-45% to-transparent"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-[clamp(0.45rem,5.5cqw,1rem)] z-20 px-[clamp(0.55rem,7cqw,1rem)] text-center">
            <span className="line-clamp-2 text-[clamp(0.75rem,5.2cqw,0.875rem)] font-semibold leading-tight text-fg drop-shadow-[0_2px_3px_rgb(0_0_0/0.95)]">
              {game.title}
            </span>
          </div>
        </>
      ) : null}
    </>
  );

  const classes = cn(
    'group relative block aspect-[3/4] shrink-0 overflow-hidden rounded-tile bg-surface [container-type:inline-size]',
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
      {...tapProps(select)}
      className={cn(classes, 'cursor-pointer hover:border-teal/70 focus-visible:outline-none')}
    >
      {inner}
    </motion.button>
  );
}
