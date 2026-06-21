'use client';

import { Reorder, motion } from 'framer-motion';
import { useRef, useState } from 'react';

import { zoneIndexAtPagePoint } from '@/components/steps/result/dnd';
import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';

import { Button } from '../../ui/Button';
import { tapProps, useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';
import { DraggableArcadeCard } from './DraggableArcadeCard';
import { MinigameHeader } from './MinigameHeader';

/**
 * Minigame 2 — "Rank these from favorite to least." The primary, touch-first interaction is
 * tap-to-order: tap cards in favorite→least order and they drop into numbered slots. Once all
 * five are placed they can also be dragged to reorder (a desktop nicety), then locked in.
 */
export function Lineup({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [placed, setPlaced] = useState<Game[]>([]);
  const slotRefs = useRef<(HTMLElement | null)[]>([]);
  slotRefs.current.length = games.length;

  const remaining = games.filter((g) => !placed.some((p) => p.igdbId === g.igdbId));
  const full = placed.length === games.length;
  const emptySlots = games.length - placed.length;

  const placeAt = (game: Game, index: number) => {
    if (placed.some((p) => p.igdbId === game.igdbId)) return false;
    playSound('blip');
    setPlaced((prev) => {
      if (prev.some((p) => p.igdbId === game.igdbId)) return prev;
      const next = [...prev];
      next.splice(Math.max(0, Math.min(Math.trunc(index), next.length)), 0, game);
      return next;
    });
    return true;
  };

  const place = (game: Game) => {
    placeAt(game, placed.length);
  };

  const unplace = (game: Game) => {
    playSound('click');
    setPlaced((prev) => prev.filter((p) => p.igdbId !== game.igdbId));
  };

  const lockIn = () => {
    if (!full) return;
    playSound('success');
    complete([{ type: 'lineup', orderedIds: placed.map((g) => g.igdbId) }]);
  };

  const handleDropAt = (game: Game, point: { x: number; y: number }) => {
    const idx = zoneIndexAtPagePoint(point, slotRefs.current);
    if (idx < 0) return false;
    return placeAt(game, idx);
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center">
      <MinigameHeader
        tone="teal"
        eyebrow="Five-card lineup"
        title="Favorite to least."
        hint={full ? 'Drag to adjust, then lock it in' : 'Tap in order — best first'}
      />

      {/* Ranking ladder: placed cards (draggable) + numbered empty slots. */}
      <div className="mb-4 w-full sm:mb-6">
        <Reorder.Group
          axis="x"
          values={placed}
          onReorder={setPlaced}
          className="flex flex-wrap justify-center gap-3"
        >
          {placed.map((game, i) => (
            <Reorder.Item
              key={game.igdbId}
              value={game}
              ref={(el: HTMLElement | null) => {
                slotRefs.current[i] = el;
              }}
              className="relative cursor-grab touch-none active:cursor-grabbing"
            >
              <ArcadeCard game={game} size="lineup" badge={i + 1} />
              <button
                type="button"
                aria-label={`Remove ${game.title}`}
                {...tapProps(() => unplace(game))}
                className="absolute -right-1.5 -top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-hardware border border-border bg-bg text-xs text-muted shadow-soft transition-colors hover:border-coin hover:text-coin focus-visible:outline-none"
              >
                ✕
              </button>
            </Reorder.Item>
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div
              key={`slot-${i}`}
              data-testid={`lineup-slot-${placed.length + i + 1}`}
              ref={(el) => {
                slotRefs.current[placed.length + i] = el;
              }}
              className="flex aspect-[3/4] w-[var(--cover-lineup)] items-center justify-center rounded-tile border border-dashed border-border/70 bg-surface/20 font-display text-2xl font-black text-muted/40"
            >
              {placed.length + i + 1}
            </div>
          ))}
        </Reorder.Group>
      </div>

      {/* Unplaced pool. */}
      {remaining.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-3 border-t border-border pt-4 sm:pt-5">
          {remaining.map((game) => (
            <motion.div key={game.igdbId} layout>
              <DraggableArcadeCard
                game={game}
                ariaLabel={game.title}
                onTap={() => place(game)}
                onDropAt={(point) => handleDropAt(game, point)}
                size="lineup"
              />
            </motion.div>
          ))}
        </div>
      ) : (
        <Button onClick={lockIn} disabled={!full}>
          Lock in ranking →
        </Button>
      )}
    </div>
  );
}
