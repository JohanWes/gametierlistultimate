'use client';

import type { MinigameProps } from '../types';
import { useComplete } from '../shared';
import { VersusBoard } from './VersusBoard';

/**
 * Minigame 9 — a boundary game faces the tier above it. Whichever the player picks earns the
 * higher placement. Emits a pairwise outcome.
 */
export function Promotion({ games, anchorId, boundary, onComplete }: MinigameProps) {
  const complete = useComplete(onComplete);
  if (games.length < 2) return null;

  // matchup order is [lower, upper] with anchorId = upper.
  const upper = games.find((g) => g.igdbId === anchorId) ?? games[1];
  const lower = games.find((g) => g.igdbId !== upper.igdbId) ?? games[0];

  return (
    <VersusBoard
      left={lower}
      right={upper}
      eyebrow="Promotion battle"
      prompt={boundary ? `Does it deserve ${boundary}-tier?` : 'Earn the higher tier'}
      seamBadge={boundary ? `${boundary}?` : undefined}
      onPick={(winner, loser) =>
        complete([{ type: 'pairwise', winnerId: winner.igdbId, loserId: loser.igdbId }])
      }
    />
  );
}
