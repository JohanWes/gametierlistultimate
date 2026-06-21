'use client';

import { Children } from 'react';

import { useIsMobile } from '@/lib/use-is-mobile';
import { cn } from '@/lib/utils';

interface CoverRailProps {
  /** Layout used on tablet/desktop — the minigame's original grid, kept byte-identical. */
  gridClassName: string;
  /** Extra classes for each item wrapper on the mobile rail (e.g. a fixed width). */
  itemClassName?: string;
  /** Hint shown under the rail on mobile to advertise the horizontal swipe. */
  hint?: string;
  children: React.ReactNode;
}

/**
 * Cover layout for the independent-pick minigames. On tablet/desktop it renders the children in
 * the supplied grid (unchanged). On phones (≤767px) it lays them out in a single horizontal,
 * snap-scrolling row so the boxarts stay large while using only one row of vertical space — the
 * next cover peeks in from the right to advertise the swipe.
 *
 * Each cover keeps its own tap handler; `ArcadeCard` already distinguishes a tap from a scroll via
 * `tapProps` (10px slop), so swiping the rail never mis-fires a pick. `pt-3` keeps the corner rank
 * badges from being clipped by the scroll container's vertical overflow.
 */
export function CoverRail({ gridClassName, itemClassName, hint = 'Swipe for more', children }: CoverRailProps) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return <div className={gridClassName}>{children}</div>;
  }

  return (
    <div className="w-full">
      <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Children.map(children, (child) => (
          <div className={cn('shrink-0 snap-center', itemClassName)}>{child}</div>
        ))}
      </div>
      <p className="mt-1.5 text-center font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
        ‹ {hint} ›
      </p>
    </div>
  );
}
