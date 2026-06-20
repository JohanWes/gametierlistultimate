'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { MIN_POOL } from '@/lib/flow';
import { clamp, cn } from '@/lib/utils';

export { MIN_POOL } from '@/lib/flow';
/** Milestone notches along the meter, matching the spec's pool-size tiers. */
export const MILESTONES = [MIN_POOL, 40, 80, 100] as const;

/** The value the meter fills toward; counts beyond it read as "100+". */
const SCALE_MAX = 100;

export interface RosterMeterProps {
  count: number;
  className?: string;
  /** Slim horizontal variant for the step header — keeps count, notched bar, and band in one row. */
  compact?: boolean;
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
export function RosterMeter({ count, className, compact = false }: RosterMeterProps) {
  const reduce = useReducedMotion();
  const pct = clamp((count / SCALE_MAX) * 100, 0, 100);
  const { eyebrow, line } = bandCopy(count);
  const unlocked = count >= MIN_POOL;

  if (compact) {
    return (
      <div
        className={cn(
          'flex flex-col gap-1.5 rounded-tile border-2 border-border bg-bg px-3 py-2 shadow-cabinet sm:w-[19rem]',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <span
              data-testid="roster-count"
              className="font-display text-2xl font-black leading-none text-accent tabular-nums"
            >
              {count}
            </span>
            <span className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-muted">
              in roster
            </span>
          </div>
          <span
            className={cn(
              'shrink-0 rounded-hardware border px-2 py-0.5 font-mono text-[0.58rem] font-bold uppercase tracking-[0.16em]',
              unlocked
                ? 'border-teal/60 bg-teal/12 text-teal'
                : 'border-border bg-surface text-muted',
            )}
          >
            {eyebrow}
          </span>
        </div>

        <div className="relative">
          <div className="h-2 w-full overflow-hidden rounded-tile border border-border bg-panel">
            <motion.div
              className="h-full rounded-tile bg-gradient-to-r from-teal to-accent"
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
            />
          </div>
          {MILESTONES.map((m) => {
            const left = clamp((m / SCALE_MAX) * 100, 0, 100);
            const reached = count >= m;
            return (
              <span
                key={m}
                aria-hidden
                className={cn(
                  'absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full',
                  reached ? 'bg-bg shadow-[0_0_5px_1px_rgb(var(--color-accent)/0.6)]' : 'bg-border',
                )}
                style={{ left: `${left}%` }}
              />
            );
          })}
        </div>

        <p className="text-[0.62rem] leading-snug text-muted">{line}</p>
      </div>
    );
  }

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
