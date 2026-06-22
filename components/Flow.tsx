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
    <AppShell showProgress={step !== 'welcome'} wide={step === 'arcade'}>
      {STEP_ORDER.map((s) => {
        if (!visited.has(s)) return null;
        const Screen = SCREENS[s];
        const active = s === step;
        return (
          <motion.div
            key={s}
            hidden={!active}
            className={active ? 'flex flex-1 flex-col' : undefined}
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
