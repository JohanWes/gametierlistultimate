'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { clamp, cn } from '@/lib/utils';

/** Smallest pool that unlocks the arcade. Below this the Continue button stays gated. */
export const MIN_POOL = 12;
/** Milestone notches along the meter, matching the spec's pool-size tiers. */
export const MILESTONES = [MIN_POOL, 40, 80, 100] as const;

/** The value the meter fills toward; counts beyond it read as "100+". */
const SCALE_MAX = 100;

export interface RosterMeterProps {
  count: number;
  className?: string;
}

function bandCopy(count: number): { eyebrow: string; line: string } {
  if (count < MIN_POOL) {
    const togo = MIN_POOL - count;
    return {
      eyebrow: 'Building',
      line: `Building your roster — ${togo} more to start.`,
    };
  }
  if (count < 40) {
    return {
      eyebrow: 'Playable',
      line: 'Your list is playable now, but adding more games will make it better.',
    };
  }
  if (count < 100) {
    return { eyebrow: 'Recommended', line: 'Recommended size — this is a strong list.' };
  }
  return { eyebrow: 'Power list', line: "Power list — you're in rare company." };
}

/**
 * Signature element: a coin-credits gauge for the game pool. The fill tracks how many games
 * you've added, and notches mark the spec's real thresholds (playable / recommended band /
 * power list) so the structure encodes actual gates rather than decoration.
 */
export function RosterMeter({ count, className }: RosterMeterProps) {
  const reduce = useReducedMotion();
  const pct = clamp((count / SCALE_MAX) * 100, 0, 100);
  const { eyebrow, line } = bandCopy(count);
  const unlocked = count >= MIN_POOL;

  return (
    <div
      className={cn('rounded-card border-2 border-border bg-bg p-4 shadow-cabinet', className)}
    >
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-2.5">
          <span
            data-testid="roster-count"
            className="font-display text-4xl font-black leading-none text-accent tabular-nums"
          >
            {count}
          </span>
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
            {count === 1 ? 'game' : 'games'} in your roster
          </span>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-hardware border px-2.5 py-1 font-mono text-[0.62rem] font-bold uppercase tracking-[0.18em]',
            unlocked
              ? 'border-teal/60 bg-teal/12 text-teal'
              : 'border-border bg-surface text-muted',
          )}
        >
          {eyebrow}
        </span>
      </div>

      <div className="relative">
        {/* Track */}
        <div className="h-3 w-full overflow-hidden rounded-tile border border-border bg-panel">
          <motion.div
            className="h-full rounded-tile bg-gradient-to-r from-teal to-accent"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
          />
        </div>
        {/* Milestone notches */}
        {MILESTONES.map((m) => {
          const left = clamp((m / SCALE_MAX) * 100, 0, 100);
          const reached = count >= m;
          return (
            <div
              key={m}
              className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${left}%` }}
            >
              <span
                aria-hidden
                className={cn(
                  'h-4 w-[3px] rounded-full',
                  reached ? 'bg-bg shadow-[0_0_6px_1px_rgb(var(--color-accent)/0.6)]' : 'bg-border',
                )}
              />
              <span
                className={cn(
                  'mt-1.5 font-mono text-[0.6rem] tabular-nums',
                  reached ? 'text-accent' : 'text-muted',
                )}
              >
                {m}
                {m === 100 ? '+' : ''}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-7 text-sm leading-snug text-muted">{line}</p>
    </div>
  );
}
