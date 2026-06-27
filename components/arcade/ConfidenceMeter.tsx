'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { REVEAL_MIN_CONFIDENCE } from '@/lib/ranking/arcade';
import { clamp, cn } from '@/lib/utils';

export interface ConfidenceMeterProps {
  /** Global tier confidence, 0–100. */
  value: number;
  /** Whether the list has reached the "good enough" threshold. */
  ready?: boolean;
  /** Slim inline variant for the arcade status strip. */
  compact?: boolean;
}

/**
 * The arcade's progress heartbeat. Shows tier confidence as a tier-spectrum energy bar with a
 * brief "+N%" pop whenever a round nudges it, so every choice visibly moves the needle.
 */
export function ConfidenceMeter({ value, ready = false, compact = false }: ConfidenceMeterProps) {
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
      <div className={cn('flex items-end justify-between', compact ? 'mb-1' : 'mb-1.5')}>
        <span
          className={cn(
            'font-mono uppercase tracking-[0.2em] text-muted',
            compact ? 'text-[0.62rem]' : 'text-xs',
          )}
        >
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
          <span
            className={cn(
              'font-display font-black tabular-nums text-fg',
              compact ? 'text-base' : 'text-lg',
            )}
          >
            {pct}%
          </span>
        </div>
      </div>

      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Tier confidence"
        className={cn(
          'relative w-full overflow-hidden rounded-tile border border-border bg-panel',
          compact ? 'h-2.5' : 'h-3',
        )}
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
        ) : (
          // The unlock target — gives the climb a destination. Pulses brighter as the fill nears it.
          <motion.span
            aria-hidden
            className="absolute inset-y-0 w-[1.5px] bg-teal shadow-[0_0_6px_rgb(var(--color-teal)/0.85)]"
            style={{ left: `${REVEAL_MIN_CONFIDENCE}%` }}
            animate={
              reduce || pct < REVEAL_MIN_CONFIDENCE - 15
                ? { opacity: 0.55 }
                : { opacity: [0.55, 1, 0.55] }
            }
            transition={reduce ? { duration: 0 } : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>
    </div>
  );
}
