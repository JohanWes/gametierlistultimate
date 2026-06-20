'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

import { playSound } from '@/lib/sound';

import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard, type CardState } from './ArcadeCard';
import { MinigameHeader } from './MinigameHeader';

/** Minigame 4 — "One has to go." Pick the weakest of five; it drops out with a playful fall. */
export function Sacrifice({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [loserId, setLoserId] = useState<number | null>(null);

  const sacrifice = (id: number) => {
    if (loserId !== null) return;
    setLoserId(id);
    playSound('click');
    const opponentIds = games.filter((g) => g.igdbId !== id).map((g) => g.igdbId);
    complete([{ type: 'sacrifice', loserId: id, opponentIds }]);
  };

  const stateFor = (id: number): CardState =>
    loserId === null ? 'idle' : loserId === id ? 'lose' : 'win';

  return (
    <div className="flex flex-col items-center">
      <MinigameHeader tone="coin" eyebrow="Sacrifice one" title="One has to go." />

      <div className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {games.map((game) => (
          <motion.div
            key={game.igdbId}
            animate={loserId === game.igdbId ? { y: 26, rotate: -6 } : { y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          >
            <ArcadeCard
              game={game}
              size="row"
              state={stateFor(game.igdbId)}
              badge={loserId === game.igdbId ? '✕' : undefined}
              onSelect={() => sacrifice(game.igdbId)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
