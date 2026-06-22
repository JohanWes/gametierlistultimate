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
   * Widen the panel on large screens (the ranking arcade). Lets the cover-forward minigames grow
   * to fill big/ultrawide monitors instead of being letterboxed inside the default `max-w-7xl`.
   * Width is the only perimeter dimension allowed to vary between steps.
   */
  wide?: boolean;
}

/** Wider panel ceiling for the arcade; below `xl` it stays at the default `max-w-7xl`. */
const WIDE_MAX = 'xl:max-w-[104rem] 2xl:max-w-[120rem]';

/** The frame every screen renders into: header (wordmark + mute) and a responsive main slot. */
export function AppShell({ children, showProgress = false, wide = false }: AppShellProps) {
  const step = useStore((s) => s.ui.step);
  const stepIndex = STEP_ORDER.indexOf(step);
  const pct = Math.round(((stepIndex + 1) / STEP_ORDER.length) * 100);

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b-2 border-black/60 bg-panel/95 shadow-cabinet backdrop-blur-sm">
        <div
          className={cn(
            'mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 sm:py-3',
            wide && WIDE_MAX,
          )}
        >
          <div className="flex items-center gap-2.5 rounded-tile border border-border bg-bg/80 px-3 py-2 shadow-soft">
            <TierSpectrum />
            <span className="whitespace-nowrap font-display text-base font-black uppercase tracking-[0.16em] text-accent sm:text-lg">
              Game Tier List Ultimate
            </span>
          </div>
          <MuteButton />
        </div>
        {/* Always reserve the rail's height so the header never grows between steps;
            the teal fill only appears once the flow is past the welcome screen. */}
        <div className="h-1.5 w-full border-t border-border bg-bg">
          {showProgress ? (
            <div
              className="h-full bg-teal transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          ) : null}
        </div>
      </header>

      <main
        className={cn(
          'mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 py-4 sm:px-6 sm:py-8',
          wide && WIDE_MAX,
        )}
      >
        <div className="flex flex-1 flex-col rounded-card border-2 border-border bg-panel/86 p-3 shadow-cabinet sm:p-5">
          {children}
        </div>
      </main>
    </div>
  );
}
