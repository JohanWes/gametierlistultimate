'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

import { STEP_ORDER, type Step, useStore } from '@/lib/store';

import { ArcadeStep } from './arcade/ArcadeStep';
import { OnboardingStep } from './steps/OnboardingStep';
import { PoolStep } from './steps/PoolStep';
import { ResultStep } from './steps/result/ResultStep';
import { WelcomeStep } from './steps/WelcomeStep';
import { AppShell } from './ui/AppShell';

const SCREENS: Record<Step, () => React.JSX.Element> = {
  welcome: WelcomeStep,
  onboarding: OnboardingStep,
  pool: PoolStep,
  arcade: ArcadeStep,
  reveal: ResultStep,
};

/**
 * The playfield steps: repeated-decision surfaces where the controls must stay reachable without
 * scrolling, so the shell is locked to the viewport (see `AppShell.contained`). The other three
 * are read top-to-bottom once and keep normal document scrolling.
 */
const CONTAINED_STEPS = new Set<Step>(['pool', 'arcade']);

/**
 * One-shot CRT power-on played over the first paint of the welcome screen: a bright beam
 * snaps across black, the shutters open, a phosphor bloom flares, and the overlay retires
 * itself. Pure CSS (`.boot-*` in globals.css). A timeout — not `animationend` — removes it,
 * so a missed animation event can never leave the screen black; it is also
 * `pointer-events: none` throughout, so it can never trap input.
 */
function CrtBoot({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
      <div className="boot-shutter boot-shutter-top" />
      <div className="boot-shutter boot-shutter-bottom" />
      <div className="boot-beam" />
      <div className="boot-bloom" />
    </div>
  );
}

/**
 * Renders the current step inside the AppShell. Steps are **keep-alive**: once a step is
 * visited it stays mounted (hidden via `display:none`) so its state and decoded cover
 * bitmaps survive step transitions. Toggling back to a previously-visited step is instant —
 * no re-mount, no re-fetch, no image re-decode. Only the first visit mounts a screen and
 * plays its entrance animation; subsequent visits are a pure `display` swap.
 */
export function Flow() {
  const step = useStore((s) => s.ui.step);
  const hydrated = useStore((s) => s.ui.hydrated);
  const reduce = useReducedMotion();

  // Cold-boot power-on: plays once per page load, only when the session opens on the welcome
  // screen (a user resuming mid-flow skips it, as does reduced-motion). Decided in the same
  // render that hydration lands (render-phase derivation), so no frame of the welcome screen
  // paints before the black shutters.
  const [boot, setBoot] = useState<'pending' | 'active' | 'done'>('pending');
  if (hydrated && boot === 'pending') {
    setBoot(step === 'welcome' && !reduce ? 'active' : 'done');
  }

  // Track which steps have been visited. A step is mounted the first time it becomes active
  // and stays mounted (hidden when inactive) for the rest of the session. Initialized empty
  // so a returning user who hydrates at "pool" doesn't mount "welcome" hidden.
  const [visited, setVisited] = useState<Set<Step>>(() => new Set());
  useEffect(() => {
    if (!hydrated) return;
    setVisited((prev) => (prev.has(step) ? prev : new Set(prev).add(step)));
  }, [step, hydrated]);

  if (!hydrated) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted">
            Loading saved session...
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <>
      {boot === 'active' ? <CrtBoot onDone={() => setBoot('done')} /> : null}
      <AppShell
        showProgress={step !== 'welcome'}
        wide={step === 'arcade'}
        contained={CONTAINED_STEPS.has(step)}
      >
        {STEP_ORDER.map((s) => {
          if (!visited.has(s)) return null;
          const Screen = SCREENS[s];
          const active = s === step;
          return (
            <motion.div
              key={s}
              hidden={!active}
              // `min-h-0` continues the chain started in AppShell: without it this wrapper's
              // default `min-height: auto` would refuse to shrink to the shell, and the step's
              // action bar would be pushed straight back off the bottom of the viewport.
              className={active ? 'flex min-h-0 flex-1 flex-col' : undefined}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <Screen />
            </motion.div>
          );
        })}
      </AppShell>
    </>
  );
}
