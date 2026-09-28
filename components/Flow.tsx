'use client';

import { motion, useReducedMotion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

import { STEP_ORDER, type Step, useStore } from '@/lib/store';

import { PoolStep } from './steps/PoolStep';
import { WelcomeStep } from './steps/WelcomeStep';
import { AppShell } from './ui/AppShell';

/**
 * Renders while a lazily-loaded step's chunk is still on the wire. Sits inside the same
 * `flex min-h-0 flex-1` wrapper as the real screen, so it fills the shell identically —
 * the contained arcade layout can never collapse while its chunk streams in.
 */
function StepFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-20">
      <p className="label text-muted">Loading…</p>
    </div>
  );
}

/**
 * Arcade and result are split into their own chunks: the homepage never ships them, and a
 * dwell-time preload warms each one before the user steps into it.
 */
const ArcadeStep = dynamic(() => import('./arcade/ArcadeStep').then((m) => m.ArcadeStep), {
  loading: StepFallback,
});
const ResultStep = dynamic(() => import('./steps/result/ResultStep').then((m) => m.ResultStep), {
  loading: StepFallback,
});

const SCREENS: Record<Step, React.ComponentType> = {
  welcome: WelcomeStep,
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

  // Track which steps have been visited. A step is mounted the first time it becomes active
  // and stays mounted (hidden when inactive) for the rest of the session. Initialized empty
  // so a returning user who hydrates at "pool" doesn't mount "welcome" hidden.
  const [visited, setVisited] = useState<Set<Step>>(() => new Set());
  useEffect(() => {
    if (!hydrated) return;
    setVisited((prev) => (prev.has(step) ? prev : new Set(prev).add(step)));
  }, [step, hydrated]);

  // Warm the next step's chunk during the current one's dwell: pool dwell streams the arcade
  // bundle in, arcade dwell streams the result bundle in, so the next step mounts the moment
  // the user taps forward. Welcome preloads nothing — its only successor is static PoolStep.
  useEffect(() => {
    if (step === 'pool') {
      void import('./arcade/ArcadeStep');
    } else if (step === 'arcade') {
      void import('./steps/result/ResultStep');
    }
  }, [step]);

  if (!hydrated) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="label text-muted">Loading saved session...</p>
        </div>
      </AppShell>
    );
  }

  return (
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
  );
}
