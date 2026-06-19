'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';

import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import { Button } from '../ui/Button';
import { TIER_ORDER, type Tier } from '../ui/Row';

const TIER_BG: Record<Tier, string> = {
  S: 'bg-tier-s',
  A: 'bg-tier-a',
  B: 'bg-tier-b',
  C: 'bg-tier-c',
  D: 'bg-tier-d',
  E: 'bg-tier-e',
  F: 'bg-tier-f',
};

// How many filled cover slots each ladder rung shows — a decorative spectrum.
const RUNG_FILL: Record<Tier, number> = { S: 3, A: 4, B: 3, C: 4, D: 2, E: 2, F: 1 };

// The flow, as a real four-beat sequence — numbered markers are earned here.
const STEPS: { label: string; detail: string }[] = [
  { label: 'Pick genres', detail: 'Tell us what you reach for.' },
  { label: 'Choose games', detail: 'Add the ones you’ve played.' },
  { label: 'Play rounds', detail: 'Quick matchups, no forms.' },
  { label: 'Get your list', detail: 'A personal S–F ranking.' },
];

/** Decorative vertical tier ladder (S→F) — the signature hero visual. */
function TierLadder() {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex flex-col gap-1.5 rounded-card border-2 border-border bg-bg p-3 shadow-cabinet">
      <div className="mb-2 flex items-center justify-between border-b border-border pb-2 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted">
        <span>Cabinet preview</span>
        <span className="text-teal">Live</span>
      </div>
      {TIER_ORDER.map((tier, i) => (
        <motion.div
          key={tier}
          initial={reduce ? false : { opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 + i * 0.06, type: 'spring', stiffness: 260, damping: 26 }}
          className="flex items-center gap-1.5"
        >
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-tile font-display text-lg font-black text-black/85 shadow-soft',
              TIER_BG[tier],
            )}
          >
            {tier}
          </span>
          <div className="flex flex-1 gap-1.5">
            {Array.from({ length: 4 }).map((_, slot) => (
              <span
                key={slot}
                className={cn(
                  'h-10 flex-1 rounded-tile border border-border',
                  slot < RUNG_FILL[tier] ? 'bg-surface-elevated' : 'bg-panel',
                )}
              />
            ))}
          </div>
        </motion.div>
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
          className="flex items-start gap-2.5 rounded-card border border-border bg-surface/70 px-3 py-2.5 shadow-soft"
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
      className="grid flex-1 items-center gap-8 py-2 text-center lg:grid-cols-2 lg:gap-12 lg:text-left"
    >
      <div className="flex flex-col items-center gap-6 lg:items-start">
        <motion.div variants={item} className="max-w-xl">
          <h1 className="font-display text-5xl font-black uppercase leading-[0.9] tracking-[0.02em] text-fg sm:text-6xl">
            Build your ultimate game tier list
          </h1>
          <p className="mt-3 text-balance text-sm uppercase tracking-[0.18em] text-muted sm:text-base">
            Rank the best games you&rsquo;ve played — through quick matchups, not drag-and-drop.
          </p>
        </motion.div>

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

      <motion.div variants={item} className="mx-auto w-full max-w-md lg:max-w-none">
        <TierLadder />
      </motion.div>
    </motion.div>
  );
}
