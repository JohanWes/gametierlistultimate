'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

import { playSound } from '@/lib/sound';

import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard, type CardState } from './ArcadeCard';
import { MinigameHeader } from './MinigameHeader';

/** Minigame 5 — "Crown one champion." Pick the best of five; the winner gets a crown + glow. */
export function Champion({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [winnerId, setWinnerId] = useState<number | null>(null);

  const crown = (id: number) => {
    if (winnerId !== null) return;
    setWinnerId(id);
    playSound('reveal');
    const opponentIds = games.filter((g) => g.igdbId !== id).map((g) => g.igdbId);
    complete([{ type: 'champion', winnerId: id, opponentIds }]);
  };

  const stateFor = (id: number): CardState =>
    winnerId === null ? 'idle' : winnerId === id ? 'win' : 'dim';

  return (
    <div className="flex flex-col items-center">
      <MinigameHeader tone="accent" eyebrow="Crown a champion" title="Pick the best one." />

      <div className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {games.map((game) => (
          <motion.div key={game.igdbId} layout>
            <ArcadeCard
              game={game}
              state={stateFor(game.igdbId)}
              badge={winnerId === game.igdbId ? '♛' : undefined}
              onSelect={() => crown(game.igdbId)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
