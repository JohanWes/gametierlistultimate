'use client';

import { useReducedMotion } from 'framer-motion';
import { useCallback, useRef } from 'react';

import type { RankingOutcome } from '@/lib/ranking';

/** The beat we hold after a decision so the win/eliminate animation can land. */
export const RESOLVE_MS = 560;

/** Fire a handler on both mouse click and touch, without the synthesized double-fire. */
export function tapProps(handler: () => void) {
  return {
    onClick: handler,
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      handler();
    },
  };
}

/**
 * Returns a `complete` callback that forwards outcomes to `onComplete` exactly once, after a
 * short beat so the closing animation can play. Honors reduced motion by firing immediately.
 */
export function useComplete(onComplete: (outcomes: RankingOutcome[]) => void) {
  const reduce = useReducedMotion();
  const fired = useRef(false);

  return useCallback(
    (outcomes: RankingOutcome[], delay = RESOLVE_MS) => {
      if (fired.current) return;
      fired.current = true;
      window.setTimeout(() => onComplete(outcomes), reduce ? 0 : delay);
    },
    [onComplete, reduce],
  );
}
