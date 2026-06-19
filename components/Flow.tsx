'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { type Step, useStore } from '@/lib/store';

import {
  ArcadeStep,
  CorrectionStep,
  OnboardingStep,
  PoolStep,
  RevealStep,
  ShareStep,
} from './steps/OtherSteps';
import { WelcomeStep } from './steps/WelcomeStep';
import { AppShell } from './ui/AppShell';

const SCREENS: Record<Step, () => React.JSX.Element> = {
  welcome: WelcomeStep,
  onboarding: OnboardingStep,
  pool: PoolStep,
  arcade: ArcadeStep,
  reveal: RevealStep,
  correction: CorrectionStep,
  share: ShareStep,
};

/** Renders the current step inside the AppShell with animated transitions between steps. */
export function Flow() {
  const step = useStore((s) => s.ui.step);
  const reduce = useReducedMotion();
  const Screen = SCREENS[step];

  return (
    <AppShell showProgress={step !== 'welcome'}>
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
