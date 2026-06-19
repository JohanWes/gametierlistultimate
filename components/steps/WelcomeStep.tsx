'use client';

import { motion, useReducedMotion } from 'framer-motion';

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

/** Decorative vertical tier ladder (S→F) — the signature hero visual. */
function TierLadder() {
  const reduce = useReducedMotion();
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface/60 p-3 shadow-lift">
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
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-tile font-display text-base font-extrabold text-black/85',
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
                  'h-9 flex-1 rounded-[6px]',
                  slot < RUNG_FILL[tier] ? 'bg-surface-elevated' : 'bg-surface/40',
                )}
              />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

const STEPS = [
  'Tell us what you like.',
  'Add the games you’ve played.',
  'Win quick ranking battles.',
  'Get your S–F tier list.',
];

export function WelcomeStep() {
  const goNext = useStore((s) => s.goNext);

  return (
    <div className="grid flex-1 items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <p className="mb-4 inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted">
          Anonymous · no login · mouse &amp; touch
        </p>
        <h1 className="font-display text-4xl font-extrabold leading-[0.98] tracking-tight text-fg sm:text-6xl">
          Rank the games
          <br />
          you <span className="text-accent">actually</span> love.
        </h1>
        <p className="mt-5 max-w-md text-balance text-muted">
          No dragging fifty boxes around. Play quick head-to-head rounds and watch your personal
          S-through-F tier list build itself.
        </p>

        <ol className="mt-7 grid gap-2 sm:grid-cols-2">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2.5 text-sm text-fg/90">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-surface-elevated font-mono text-xs text-accent">
                {i + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>

        <div className="mt-9">
          <Button
            size="lg"
            onClick={() => {
              playSound('success');
              goNext();
            }}
          >
            Start ranking →
          </Button>
        </div>
      </div>

      <div className="lg:pl-4">
        <TierLadder />
      </div>
    </div>
  );
}
