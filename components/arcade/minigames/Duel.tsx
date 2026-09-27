'use client';

import type { MinigameProps } from '../types';
import { useComplete } from '../shared';
import { VersusBoard } from './VersusBoard';

interface DuelProps extends MinigameProps {
  eyebrow?: string;
  prompt?: string;
}

/**
 * Two covers, "Which one wins?". Emits a single pairwise outcome. Also plays the `promotion`
 * round: the engine picks that pair across a tier seam, but it reads as a plain head-to-head.
 */
export function Duel({ games, onComplete, eyebrow, prompt = 'Which one wins?' }: DuelProps) {
  const complete = useComplete(onComplete);
  const [left, right] = games;
  if (!left || !right) return null;

  return (
    <VersusBoard
      left={left}
      right={right}
      eyebrow={eyebrow}
      prompt={prompt}
      onPick={(winner, loser) =>
        complete([{ type: 'pairwise', winnerId: winner.igdbId, loserId: loser.igdbId }])
      }
    />
  );
}

/** Two contextually related games. Same mechanic as the duel, framed as a feud. */
export function Rivalry(props: MinigameProps) {
  return <Duel {...props} eyebrow="Settle the rivalry" prompt="Who takes it?" />;
}
