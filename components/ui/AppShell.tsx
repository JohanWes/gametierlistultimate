'use client';

import { STEP_ORDER, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import { MuteButton } from './MuteButton';
import { TIER_ORDER } from './Row';

const TIER_DOT: Record<string, string> = {
  S: 'bg-tier-s',
  A: 'bg-tier-a',
  B: 'bg-tier-b',
  C: 'bg-tier-c',
  D: 'bg-tier-d',
  E: 'bg-tier-e',
  F: 'bg-tier-f',
};

/** The rainbow tier spectrum — the product's signature mark. */
function TierSpectrum() {
  return (
    <span aria-hidden className="hidden items-center gap-1 min-[420px]:flex">
      {TIER_ORDER.map((t) => (
        <span key={t} className={cn('h-2.5 w-4 rounded-[2px] shadow-soft', TIER_DOT[t])} />
      ))}
    </span>
  );
}

export interface AppShellProps {
  children: React.ReactNode;
  /** Show the step progress rail under the header. */
  showProgress?: boolean;
  /**
   * Compact chrome for work surfaces (Steps 3 & 4): a slimmer brand bar and tighter outer
   * padding so the active task starts higher in the viewport.
   */
  compact?: boolean;
  /**
   * Widen the panel on large screens (the ranking arcade). Lets the cover-forward minigames grow
   * to fill big/ultrawide monitors instead of being letterboxed inside the default `max-w-7xl`.
   */
  wide?: boolean;
}

/** Wider panel ceiling for the arcade; below `xl` it stays at the default `max-w-7xl`. */
const WIDE_MAX = 'xl:max-w-[104rem] 2xl:max-w-[120rem]';

/** The frame every screen renders into: header (wordmark + mute) and a responsive main slot. */
export function AppShell({
  children,
  showProgress = false,
  compact = false,
  wide = false,
}: AppShellProps) {
  const step = useStore((s) => s.ui.step);
  const stepIndex = STEP_ORDER.indexOf(step);
  const pct = Math.round(((stepIndex + 1) / STEP_ORDER.length) * 100);

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b-2 border-black/60 bg-panel/95 shadow-cabinet backdrop-blur-sm">
        <div
          className={cn(
            'mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6',
            wide && WIDE_MAX,
            compact ? 'py-2' : 'py-2.5 sm:py-3',
          )}
        >
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-tile border border-border bg-bg/80 shadow-soft',
              compact ? 'px-2.5 py-1.5' : 'px-3 py-2',
            )}
          >
            <TierSpectrum />
            <span
              className={cn(
                'whitespace-nowrap font-display font-black uppercase tracking-[0.16em] text-accent',
                compact ? 'text-sm sm:text-base' : 'text-base sm:text-lg',
              )}
            >
              Game Tier List Ultimate
            </span>
          </div>
          <MuteButton />
        </div>
        {showProgress ? (
          <div className="h-1.5 w-full border-t border-border bg-bg">
            <div
              className="h-full bg-teal transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </header>

      <main
        className={cn(
          'mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 sm:px-6',
          wide && WIDE_MAX,
          compact ? 'py-3 sm:py-4' : 'py-4 sm:py-8',
        )}
      >
        <div
          className={cn(
            'flex flex-1 flex-col rounded-card border-2 border-border bg-panel/86 shadow-cabinet',
            compact ? 'p-3 sm:p-4' : 'p-3 sm:p-5',
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
