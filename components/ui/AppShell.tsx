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
        <span key={t} className={cn('h-2.5 w-4 rounded-[2px] shadow-soft', TIER_DOT[t])} />
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
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b-2 border-black/60 bg-panel/95 shadow-cabinet backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 rounded-tile border border-border bg-bg/80 px-3 py-2 shadow-soft">
            <TierSpectrum />
            <span className="font-display text-base font-black uppercase tracking-[0.18em] text-accent sm:text-lg">
              Ultimate Tier List
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

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 py-4 sm:px-6 sm:py-8">
        <div className="flex flex-1 flex-col rounded-card border-2 border-border bg-panel/86 p-3 shadow-cabinet sm:p-5">
          {children}
        </div>
      </main>
    </div>
  );
}
