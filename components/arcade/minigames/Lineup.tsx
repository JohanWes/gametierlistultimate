'use client';

import { Reorder, motion } from 'framer-motion';
import { useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';

import { Button } from '../../ui/Button';
import { tapProps, useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';

/**
 * Minigame 2 — "Rank these from favorite to least." The primary, touch-first interaction is
 * tap-to-order: tap cards in favorite→least order and they drop into numbered slots. Once all
 * five are placed they can also be dragged to reorder (a desktop nicety), then locked in.
 */
export function Lineup({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [placed, setPlaced] = useState<Game[]>([]);

  const remaining = games.filter((g) => !placed.some((p) => p.igdbId === g.igdbId));
  const full = placed.length === games.length;
  const emptySlots = games.length - placed.length;

  const place = (game: Game) => {
    if (placed.some((p) => p.igdbId === game.igdbId)) return;
    playSound('blip');
    setPlaced((prev) => [...prev, game]);
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

  return (
    <div className="flex flex-col items-center">
      <header className="mb-6 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.28em] text-teal">Five-card lineup</p>
        <h2 className="font-display text-3xl font-black uppercase tracking-[0.02em] text-fg sm:text-4xl">
          Favorite to least.
        </h2>
        <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted">
          {full ? 'Drag to adjust, then lock it in' : 'Tap in order — best first'}
        </p>
      </header>

      {/* Ranking ladder: placed cards (draggable) + numbered empty slots. */}
      <div className="mb-6 w-full">
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
              className="relative cursor-grab touch-none active:cursor-grabbing"
            >
              <ArcadeCard game={game} size="sm" badge={i + 1} />
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
              className="flex aspect-[3/4] w-[104px] items-center justify-center rounded-tile border border-dashed border-border/70 bg-surface/20 font-display text-2xl font-black text-muted/40"
            >
              {placed.length + i + 1}
            </div>
          ))}
        </Reorder.Group>
      </div>

      {/* Unplaced pool. */}
      {remaining.length > 0 ? (
        <div className="flex flex-wrap justify-center gap-3 border-t border-border pt-5">
          {remaining.map((game) => (
            <motion.div key={game.igdbId} layout>
              <ArcadeCard game={game} size="sm" onSelect={() => place(game)} />
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
