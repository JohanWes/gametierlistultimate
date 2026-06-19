'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { clamp, cn } from '@/lib/utils';

export interface ProgressMeterProps {
  /** Completion percentage; clamped to 0–100. */
  value: number;
  label?: string;
  className?: string;
}

/** Animated confidence/progress bar. Always clamps the incoming value to 0–100. */
export function ProgressMeter({ value, label, className }: ProgressMeterProps) {
  const reduce = useReducedMotion();
  const pct = clamp(Math.round(value), 0, 100);

  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-muted">
          <span>{label}</span>
          <span className="font-mono text-fg">{pct}%</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
        className="h-3 w-full overflow-hidden rounded-tile border border-border bg-panel"
      >
        <motion.div
          className="h-full rounded-tile bg-teal"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
        />
      </div>
    </div>
  );
}
