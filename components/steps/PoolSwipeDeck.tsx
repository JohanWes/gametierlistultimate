'use client';

import type { Game } from '@/lib/games/types';
import type { PoolDecision } from '@/lib/pool-decision';

import { Button } from '../ui/Button';
import { GameCard } from '../ui/GameCard';
import { PoolSwipeCard } from './PoolSwipeCard';

interface SlotEntry {
  game: Game;
}

export interface PoolSwipeDeckProps {
  slots: (SlotEntry | null)[];
  error: boolean;
  exhausted: boolean;
  onDecide: (id: number, action: PoolDecision) => void;
  onRetry: () => void;
  /** Injected RNG forwarded to the active card's spotlight roll. */
  random?: () => number;
}

const HERO_WIDTH = 'w-[min(80vw,20rem)]';

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
      <div className="flex flex-col items-center gap-5">
        <GameCard loading size="lg" className={`${HERO_WIDTH} rounded-card`} />
        <div className="flex items-start gap-10">
          <div className="h-16 w-16 rounded-hardware border-2 border-border bg-surface" />
          <div className="h-16 w-16 rounded-hardware border-2 border-border bg-surface" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted">
        Swipe right if you&rsquo;ve played it · left to pass
      </p>
      <div className="relative flex w-full justify-center">
        {peek ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
          >
            <div className={`${HERO_WIDTH} translate-y-3 scale-[0.92] opacity-50`}>
              <GameCard
                game={peek.game}
                showTitle={false}
                size="lg"
                eager
                className="w-full rounded-card border-2 border-border"
              />
            </div>
          </div>
        ) : null}

        <div className="relative flex w-full justify-center">
          <PoolSwipeCard
            key={active.game.igdbId}
            game={active.game}
            random={random}
            onDecide={(action) => onDecide(active.game.igdbId, action)}
          />
        </div>
      </div>
    </div>
  );
}
