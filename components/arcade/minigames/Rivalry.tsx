'use client';

import type { MinigameProps } from '../types';
import { useComplete } from '../shared';
import { VersusBoard } from './VersusBoard';

/** Minigame 8 — two contextually related games. Same mechanic as the duel, framed as a feud. */
export function Rivalry({ games, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  const [left, right] = games;
  if (!left || !right) return null;

  return (
    <VersusBoard
      left={left}
      right={right}
      eyebrow="Settle the rivalry"
      prompt="Who takes it?"
      onPick={(winner, loser) =>
        complete([{ type: 'pairwise', winnerId: winner.igdbId, loserId: loser.igdbId }])
      }
    />
  );
}
