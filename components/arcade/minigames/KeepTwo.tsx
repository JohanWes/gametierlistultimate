'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

import { playSound } from '@/lib/sound';

import { useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard, type CardState } from './ArcadeCard';

const KEEP = 2;

/** Minigame 3 — "Only two survive." Tap your two favorites; the rest are rejected this round. */
export function KeepTwo({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [picked, setPicked] = useState<number[]>([]);
  const [done, setDone] = useState(false);

  const toggle = (id: number) => {
    if (done) return;
    setPicked((prev) => {
      if (prev.includes(id)) {
        playSound('blip');
        return prev.filter((p) => p !== id);
      }
      if (prev.length >= KEEP) return prev;
      const next = [...prev, id];
      if (next.length === KEEP) {
        setDone(true);
        playSound('success');
        const rejectedIds = games.filter((g) => !next.includes(g.igdbId)).map((g) => g.igdbId);
        complete([{ type: 'pick-k-of-n', pickedIds: next, rejectedIds }]);
      } else {
        playSound('blip');
      }
      return next;
    });
  };

  const stateFor = (id: number): CardState => {
    if (!done) return picked.includes(id) ? 'win' : 'idle';
    return picked.includes(id) ? 'win' : 'lose';
  };

  const remaining = KEEP - picked.length;

  return (
    <div className="flex flex-col items-center">
      <header className="mb-6 text-center">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.28em] text-teal">Keep 2, kill 3</p>
        <h2 className="font-display text-3xl font-black uppercase tracking-[0.02em] text-fg sm:text-4xl">
          Only two survive.
        </h2>
        <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted">
          {done ? 'Locked in' : `Choose ${remaining} more`}
        </p>
      </header>

      <div className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {games.map((game) => {
          const order = picked.indexOf(game.igdbId);
          return (
            <motion.div key={game.igdbId} layout>
              <ArcadeCard
                game={game}
                state={stateFor(game.igdbId)}
                badge={order >= 0 ? order + 1 : undefined}
                onSelect={() => toggle(game.igdbId)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
