'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Tier } from '@/lib/ranking';

/** Reveal order: weakest first, S last so the top tier feels earned. */
export const REVEAL_SEQUENCE: Tier[] = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];

export interface UseRevealResult {
  /** The set of tiers revealed so far. */
  revealed: Set<Tier>;
  /** True once every tier is shown. */
  done: boolean;
  /** Reveal everything immediately (cancels the staggered timers). */
  skip: () => void;
}

/**
 * Drives the bottom-up reveal. When `instant` (reduced motion) everything shows at once. Otherwise
 * tiers appear one at a time on a timer, firing `onReveal(tier, isLast)` per row so the caller can
 * play sounds. `skip` cancels the remaining timers and shows the rest.
 */
export function useReveal({
  instant,
  intervalMs = 460,
  onReveal,
}: {
  instant: boolean;
  intervalMs?: number;
  onReveal?: (tier: Tier, isLast: boolean) => void;
}): UseRevealResult {
  const [revealed, setRevealed] = useState<Set<Tier>>(() =>
    instant ? new Set(REVEAL_SEQUENCE) : new Set(),
  );
  const timersRef = useRef<number[]>([]);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;

  useEffect(() => {
    if (instant) return;
    REVEAL_SEQUENCE.forEach((tier, i) => {
      const id = window.setTimeout(
        () => {
          setRevealed((prev) => new Set(prev).add(tier));
          onRevealRef.current?.(tier, i === REVEAL_SEQUENCE.length - 1);
        },
        (i + 1) * intervalMs,
      );
      timersRef.current.push(id);
    });
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [instant, intervalMs]);

  const skip = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setRevealed(new Set(REVEAL_SEQUENCE));
  }, []);

  return { revealed, done: revealed.size === REVEAL_SEQUENCE.length, skip };
}
