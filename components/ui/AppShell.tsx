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
    <span aria-hidden className="flex items-center gap-1">
      {TIER_ORDER.map((t) => (
        <span key={t} className={cn('h-2.5 w-2.5 rounded-[3px]', TIER_DOT[t])} />
      ))}
    </span>
  );
}

export interface AppShellProps {
  children: React.ReactNode;
  /** Show the step progress rail under the header. */
  showProgress?: boolean;
}

/** The frame every screen renders into: header (wordmark + mute) and a responsive main slot. */
export function AppShell({ children, showProgress = false }: AppShellProps) {
  const step = useStore((s) => s.ui.step);
  const stepIndex = STEP_ORDER.indexOf(step);
  const pct = Math.round(((stepIndex + 1) / STEP_ORDER.length) * 100);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <TierSpectrum />
            <span className="font-display text-sm font-extrabold uppercase tracking-[0.18em] text-fg sm:text-base">
              Ultimate Tier List
            </span>
          </div>
          <MuteButton />
        </div>
        {showProgress ? (
          <div className="h-0.5 w-full bg-border/40">
            <div
              className="h-full bg-gradient-to-r from-tier-s via-tier-c to-tier-e transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}
