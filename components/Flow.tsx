'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { type Step, useStore } from '@/lib/store';

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

/** Renders the current step inside the AppShell with animated transitions between steps. */
export function Flow() {
  const step = useStore((s) => s.ui.step);
  const hydrated = useStore((s) => s.ui.hydrated);
  const reduce = useReducedMotion();
  const Screen = SCREENS[step];
  const compact = step === 'pool' || step === 'arcade';

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
    <AppShell showProgress={step !== 'welcome'} compact={compact} wide={step === 'arcade'}>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="flex flex-1 flex-col"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <Screen />
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
