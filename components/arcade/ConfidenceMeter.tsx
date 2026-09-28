'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { REVEAL_MIN_CONFIDENCE } from '@/lib/ranking/arcade';
import { clamp } from '@/lib/utils';

interface ConfidenceMeterProps {
  /** Global tier confidence, 0–100. */
  value: number;
  /** Whether the list has reached the "good enough" threshold. */
  ready?: boolean;
}

/**
 * The arcade's progress heartbeat. Shows tier confidence as a tier-spectrum energy bar with a
 * brief "+N%" pop whenever a round nudges it, so every choice visibly moves the needle.
 */
export function ConfidenceMeter({ value, ready = false }: ConfidenceMeterProps) {
  const reduce = useReducedMotion();
  const pct = clamp(Math.round(value), 0, 100);
  const prev = useRef(pct);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    const d = pct - prev.current;
    prev.current = pct;
    if (d === 0) return;
    setDelta(d);
    const timer = window.setTimeout(() => setDelta(null), 1300);
    return () => window.clearTimeout(timer);
  }, [pct]);

  return (
    <div className="w-full">
      <div className="mb-1 flex items-end justify-between">
        <span className="label text-muted">Tier confidence</span>
        <div className="flex items-baseline gap-2">
          <AnimatePresence>
            {delta !== null && delta > 0 ? (
              <motion.span
                key={`${delta}-${pct}`}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="font-mono text-xs font-bold text-teal"
              >
                +{delta}%
              </motion.span>
            ) : null}
          </AnimatePresence>
          <span className="font-display text-base font-black tabular-nums text-fg">{pct}%</span>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Tier confidence"
        className="relative h-2.5 w-full overflow-hidden rounded-tile border border-border bg-panel"
      >
        <motion.div
          className="h-full rounded-tile"
          style={{
            background:
              'linear-gradient(90deg, rgb(var(--color-coin)), rgb(var(--color-accent)) 55%, rgb(var(--color-teal)))',
          }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
        />
        {ready ? null : (
          // The unlock target — gives the climb a destination.
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-teal"
            style={{ left: `${REVEAL_MIN_CONFIDENCE}%` }}
          />
        )}
      </div>
    </div>
  );
}
