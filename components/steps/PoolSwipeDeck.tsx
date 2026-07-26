'use client';

import type { Game } from '@/lib/games/types';
import type { PoolDecision } from '@/lib/pool-decision';

import { Button } from '../ui/Button';
import { GameCard } from '../ui/GameCard';
import { HERO_SIZE, PoolSwipeCard } from './PoolSwipeCard';

interface SlotEntry {
  game: Game;
}

export interface PoolSwipeDeckProps {
  slots: (SlotEntry | null)[];
  error: boolean;
  exhausted: boolean;
  onDecide: (id: number, action: PoolDecision) => void;
  onRetry: () => void;
  /** Open the gameplay-footage popup, expanding from the tapped card's rect. */
  onWatch?: (game: Game, rect: DOMRect) => void;
  /** Injected RNG forwarded to the active card's spotlight roll. */
  random?: () => number;
}

/**
 * Mobile pool builder: a single boxart card you swipe through, with the next card peeking behind
 * it for a stacked-deck feel. `PoolStep` stays the controller — this only renders the front of the
 * slot queue and reports the decision back via `onDecide`.
 */
export function PoolSwipeDeck({
  slots,
  error,
  exhausted,
  onDecide,
  onRetry,
  onWatch,
  random,
}: PoolSwipeDeckProps) {
  const deck = slots.filter((s): s is SlotEntry => s !== null);
  const active = deck[0];
  const peek = deck[1];

  if (!active) {
    if (error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-coin/50 bg-surface/40 p-8 text-center">
          <p className="font-display text-lg font-bold uppercase tracking-[0.04em] text-fg">
            Couldn&rsquo;t load suggestions
          </p>
          <p className="max-w-xs text-sm text-muted">
            The game library didn&rsquo;t respond — this can happen on the first load. Retrying
            automatically…
          </p>
          <Button variant="secondary" onClick={onRetry}>
            Retry now
          </Button>
        </div>
      );
    }
    if (exhausted) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface/40 p-8 text-center">
          <p className="font-display text-lg font-bold uppercase tracking-[0.04em] text-fg">
            That&rsquo;s our whole shelf for now
          </p>
          <p className="max-w-xs text-sm text-muted">
            You&rsquo;ve reviewed every suggestion that fits. Use search above to add any game by
            name, then enter the arcade.
          </p>
        </div>
      );
    }
    // Loading / bootstrap: a single hero skeleton instead of a five-up grid.
    return (
      <div className="flex h-full min-h-0 flex-col items-center gap-3">
        <div className="flex min-h-0 flex-1 justify-center">
          <GameCard loading size="lg" className={`${HERO_SIZE} rounded-card`} />
        </div>
        <div className="flex shrink-0 items-start gap-10">
          <div className="h-14 w-14 rounded-hardware border-2 border-border bg-surface" />
          <div className="h-14 w-14 rounded-hardware border-2 border-border bg-surface" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center gap-2">
      {/* Teaches the swipe affordance only — the ✓/✕ buttons below are self-labelling, so the old
          two-line "swipe right … left to pass" was duplicating them and costing ~40px at 375px. */}
      <p className="shrink-0 whitespace-nowrap font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted">
        ‹ Swipe or tap below ›
      </p>
      {/* The card owns this whole slot and lays out card-over-actions itself, so the peek card is
          handed to it rather than absolutely positioned here — that keeps the stacked-deck effect
          aligned to the cover alone instead of overlapping the ✓/✕ row. */}
      <div className="flex min-h-0 w-full flex-1 justify-center">
        <PoolSwipeCard
          key={active.game.igdbId}
          game={active.game}
          peek={peek?.game}
          random={random}
          onDecide={(action) => onDecide(active.game.igdbId, action)}
          onWatch={onWatch}
        />
      </div>
    </div>
  );
}
