'use client';

import type { MinigameProps } from '../types';
import { useComplete } from '../shared';
import { VersusBoard } from './VersusBoard';

/**
 * Minigame 9 — a boundary pair presented as a plain head-to-head. The engine still picks these
 * two because they sit across a tier seam (so the verdict is high-signal), but nothing about the
 * tier or a "promotion" is revealed to the player — it reads as a simple VS, same as a duel.
 * Emits a pairwise outcome.
 */
export function Promotion({ games, anchorId, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  if (games.length < 2) return null;

  const upper = games.find((g) => g.igdbId === anchorId) ?? games[1];
  const lower = games.find((g) => g.igdbId !== upper.igdbId) ?? games[0];

  return (
    <VersusBoard
      left={lower}
      right={upper}
      prompt="Which one wins?"
      onPick={(winner, loser) =>
        complete([{ type: 'pairwise', winnerId: winner.igdbId, loserId: loser.igdbId }])
      }
    />
  );
}
