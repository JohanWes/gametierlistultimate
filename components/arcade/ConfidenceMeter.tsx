'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { clamp } from '@/lib/utils';

export interface ConfidenceMeterProps {
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
      <div className="mb-1.5 flex items-end justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          Tier confidence
        </span>
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
          <span className="font-display text-lg font-black tabular-nums text-fg">{pct}%</span>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Tier confidence"
        className="relative h-3 w-full overflow-hidden rounded-tile border border-border bg-panel"
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
        {ready ? (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-tile"
            style={{ boxShadow: 'inset 0 0 14px rgb(var(--color-teal) / 0.6)' }}
            animate={reduce ? undefined : { opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        ) : null}
      </div>
    </div>
  );
}
