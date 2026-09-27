'use client';

import type { Tier } from '@/lib/ranking';
import { cn } from '@/lib/utils';

// Static class maps so Tailwind's content scanner keeps these utilities (no dynamic strings).
export const TIER_BG: Record<Tier, string> = {
  S: 'bg-tier-s',
  A: 'bg-tier-a',
  B: 'bg-tier-b',
  C: 'bg-tier-c',
  D: 'bg-tier-d',
  E: 'bg-tier-e',
  F: 'bg-tier-f',
};

/** Tier-coloured inset stripe down a row's left edge. */
export const TIER_TINT: Record<Tier, string> = {
  S: 'shadow-[inset_3px_0_0_rgb(var(--tier-s))]',
  A: 'shadow-[inset_3px_0_0_rgb(var(--tier-a))]',
  B: 'shadow-[inset_3px_0_0_rgb(var(--tier-b))]',
  C: 'shadow-[inset_3px_0_0_rgb(var(--tier-c))]',
  D: 'shadow-[inset_3px_0_0_rgb(var(--tier-d))]',
  E: 'shadow-[inset_3px_0_0_rgb(var(--tier-e))]',
  F: 'shadow-[inset_3px_0_0_rgb(var(--tier-f))]',
};

interface RowProps {
  tier: Tier;
  children?: React.ReactNode;
  count?: number;
  className?: string;
}

/**
 * One tier row: a colored letter label on the left and a horizontally scrolling strip of
 * game covers on the right. Stack these in TIER_ORDER (S→F) to form the tier list.
 */
export function Row({ tier, children, count, className }: RowProps) {
  return (
    <div
      className={cn(
        'flex items-stretch gap-3 overflow-hidden rounded-card border border-border bg-surface shadow-cabinet',
        TIER_TINT[tier],
        className,
      )}
    >
      <div
        className={cn(
          'flex w-14 shrink-0 flex-col items-center justify-center py-4 sm:w-16',
          TIER_BG[tier],
        )}
      >
        <span className="font-display text-2xl font-extrabold text-black/85 sm:text-3xl">{tier}</span>
        {typeof count === 'number' ? (
          <span className="font-mono text-[0.65rem] text-black/60">{count}</span>
        ) : null}
      </div>
      {/* `min-w-0` so this `flex-1` strip can shrink below its content and scroll internally
          instead of widening the row (the parent's `overflow-hidden` was masking it). */}
      <div className="flex min-h-[140px] min-w-0 flex-1 items-center gap-2.5 overflow-x-auto py-3 pr-3">
        {children}
      </div>
    </div>
  );
}
