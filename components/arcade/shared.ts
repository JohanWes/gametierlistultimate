'use client';

import { useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef } from 'react';

import type { RankingOutcome } from '@/lib/ranking';

/** Re-exported so arcade call sites keep importing tap handling from a single place. */
export { tapProps } from '@/lib/tap';

/** The beat we hold after a decision so the win/eliminate animation can land. */
export const RESOLVE_MS = 560;

/**
 * Returns a `complete` callback that forwards outcomes to `onComplete` exactly once, after a
 * short beat so the closing animation can play. Honors reduced motion by firing immediately.
 */
export function useComplete(onComplete: (outcomes: RankingOutcome[]) => void) {
  const reduce = useReducedMotion();
  const fired = useRef(false);
  const timer = useRef<number | null>(null);

  // Clear a pending completion if the minigame unmounts first (e.g. the player taps "Skip round"
  // during a long champion hold), so a stale outcome can't be applied to the next round.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(
    (outcomes: RankingOutcome[], delay = RESOLVE_MS) => {
      if (fired.current) return;
      fired.current = true;
      timer.current = window.setTimeout(() => onComplete(outcomes), reduce ? 0 : delay);
    },
    [onComplete, reduce],
  );
}
