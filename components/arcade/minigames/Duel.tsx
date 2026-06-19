'use client';

import type { MinigameProps } from '../types';
import { useComplete } from '../shared';
import { VersusBoard } from './VersusBoard';

/** Minigame 1 — two covers, "Which one wins?". Emits a single pairwise outcome. */
export function Duel({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [left, right] = games;
  if (!left || !right) return null;

  return (
    <VersusBoard
      left={left}
      right={right}
      prompt="Which one wins?"
      onPick={(winner, loser) =>
        complete([{ type: 'pairwise', winnerId: winner.igdbId, loserId: loser.igdbId }])
      }
    />
  );
}
