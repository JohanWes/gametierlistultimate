'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';

import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import { Button } from '../ui/Button';
import { TIER_ORDER, type Tier } from '../ui/Row';
import { AttractCabinet } from './AttractCabinet';

const TIER_BG: Record<Tier, string> = {
  S: 'bg-tier-s',
  A: 'bg-tier-a',
  B: 'bg-tier-b',
  C: 'bg-tier-c',
  D: 'bg-tier-d',
  E: 'bg-tier-e',
  F: 'bg-tier-f',
};

// The flow, as a real four-beat sequence — numbered markers are earned here.
const STEPS: { label: string; detail: string }[] = [
  { label: 'Pick genres', detail: 'Tell us what you reach for.' },
  { label: 'Choose games', detail: 'Add the ones you’ve played.' },
  { label: 'Play rounds', detail: 'Quick matchups, no forms.' },
  { label: 'Get your list', detail: 'A personal S–F ranking.' },
];

/** Slim S→F spectrum rule — the tier palette as a single identity mark under the wordmark. */
function SpectrumRule() {
  return (
    <div
      aria-hidden
      className="mt-4 flex h-1.5 w-full max-w-xs overflow-hidden rounded-hardware lg:mx-0"
    >
      {TIER_ORDER.map((tier) => (
        <span key={tier} className={cn('flex-1', TIER_BG[tier])} />
      ))}
    </div>
  );
}

/** The "how it works" ticket strip — four numbered beats of the flow. */
function HowItWorks({ itemVariants }: { itemVariants: Variants }) {
  return (
    <ol className="grid w-full grid-cols-2 gap-2.5 text-left">
      {STEPS.map((step, i) => (
        <motion.li
          key={step.label}
          variants={itemVariants}
          className="flex items-start gap-2.5 rounded-card border border-border bg-surface/70 px-2.5 py-2 shadow-soft sm:px-3 sm:py-2.5"
        >
          <span className="font-mono text-sm font-bold tabular-nums text-accent">0{i + 1}</span>
          <span>
            <span className="block font-display text-sm font-bold uppercase tracking-[0.04em] text-fg">
              {step.label}
            </span>
            <span className="block text-xs leading-snug text-muted">{step.detail}</span>
          </span>
        </motion.li>
      ))}
    </ol>
  );
}

export function WelcomeStep() {
  const goNext = useStore((s) => s.goNext);
  const step = useStore((s) => s.ui.step);
  const reduce = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.12, delayChildren: reduce ? 0 : 0.05 } },
  };
  const item: Variants = reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 16 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 30 } },
      };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid flex-1 items-center gap-4 py-1 text-center sm:gap-8 sm:py-2 lg:grid-cols-2 lg:gap-12 lg:text-left"
    >
      {/* Headline — row 1, left column on desktop; first on mobile. */}
      <motion.div
        variants={item}
        className="flex flex-col items-center lg:col-start-1 lg:row-start-1 lg:items-start"
      >
        <h1 className="font-display text-4xl font-black uppercase leading-[0.9] tracking-[0.02em] text-fg sm:text-6xl">
          Game Tier List Ultimate
        </h1>
        <p className="mt-2 max-w-xl text-balance text-sm uppercase tracking-[0.18em] text-muted sm:mt-3 sm:text-base">
          Rank the best games you&rsquo;ve played — through quick matchups, not drag-and-drop.
        </p>
        <SpectrumRule />
      </motion.div>

      {/* Cabinet — right column spanning both rows on desktop; second on mobile (the eye-catcher). */}
      <motion.div
        variants={item}
        className="w-full lg:col-start-2 lg:row-span-2 lg:self-center"
      >
        <AttractCabinet active={step === 'welcome'} />
      </motion.div>

      {/* How it works + CTA — row 2, left column on desktop; last on mobile. */}
      <div className="flex flex-col items-center gap-4 sm:gap-6 lg:col-start-1 lg:row-start-2 lg:items-start">
        <motion.div variants={item} className="w-full max-w-xl">
          <HowItWorks itemVariants={item} />
        </motion.div>

        <motion.div variants={item} className="relative">
          {!reduce ? (
            <span
              aria-hidden
              className="absolute -inset-1 rounded-control bg-accent/30 blur-md animate-pulse-glow"
            />
          ) : null}
          <Button
            size="lg"
            className="relative"
            onClick={() => {
              playSound('success');
              goNext();
            }}
          >
            Press start →
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
