'use client';

import { sharpenIgdbCoverUrl } from '@/lib/games/normalize';
import type { Game } from '@/lib/games/types';
import { cn } from '@/lib/utils';

interface GameCardProps {
  game?: Pick<Game, 'title' | 'coverUrl'>;
  /** Show the loading skeleton instead of content. */
  loading?: boolean;
  /** Hide the title overlay when a parent surface provides its own cover treatment. */
  showTitle?: boolean;
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
  // Pool builder (Step 2): viewport-responsive large boxart (see --cover-pool in app/globals.css).
  pool: 'w-[var(--cover-pool)]',
  // Arcade tokens: viewport-responsive widths (see --cover-* in app/globals.css).
  row: 'w-[var(--cover-row)]',
  duo: 'w-[var(--cover-duo)]',
  zone: 'w-[var(--cover-zone)]',
  lineup: 'w-[var(--cover-lineup)]',
  solo: 'w-[var(--cover-solo)]',
} as const;

/**
 * Cover-forward, non-interactive game card. Shows a shimmer skeleton while loading and a graceful
 * title fallback when there is no cover.
 */
export function GameCard({
  game,
  loading = false,
  showTitle = true,
  size = 'md',
  className,
  imageClassName,
  eager = false,
}: GameCardProps) {
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

  // One cover size everywhere, so a cover already cached by the pool/arcade is reused as-is on
  // the reveal board instead of being re-downloaded at another size.
  const coverUrl = game.coverUrl ? sharpenIgdbCoverUrl(game.coverUrl) : null;

  return (
    <div
      className={cn(
        'group relative block aspect-[3/4] shrink-0 overflow-hidden rounded-tile bg-surface [container-type:inline-size]',
        'border border-border shadow-soft transition-colors duration-150',
        SIZES[size],
        className,
      )}
      title={game.title}
    >
      {coverUrl ? (
        // Covers come from many IGDB hosts; a plain img avoids per-domain next/image config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt={game.title}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          decoding="async"
          className={cn('h-full w-full object-cover', imageClassName)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-elevated p-3 text-center">
          <span className="font-display text-sm font-semibold leading-tight text-fg/90">
            {game.title}
          </span>
        </div>
      )}
      {coverUrl && showTitle ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[36%] bg-gradient-to-t from-black/95 via-black/72 via-45% to-transparent"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-[clamp(0.45rem,5.5cqw,1rem)] z-20 px-[clamp(0.55rem,7cqw,1rem)] text-center">
            <span className="line-clamp-2 text-[clamp(0.75rem,5.2cqw,1rem)] font-semibold leading-tight text-fg drop-shadow-[0_2px_3px_rgb(0_0_0/0.95)]">
              {game.title}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}
