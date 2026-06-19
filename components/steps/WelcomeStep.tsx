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

export function WelcomeStep() {
  const goNext = useStore((s) => s.goNext);

  return (
    <div className="flex flex-1 flex-col items-center justify-between gap-8 py-5 text-center sm:py-8">
      <div className="max-w-4xl">
        <h1 className="font-display text-5xl font-black uppercase leading-[0.9] tracking-[0.02em] text-fg sm:text-7xl">
          Create your game tier list
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-sm uppercase tracking-[0.18em] text-muted sm:text-base">
          Quick matchups. S-F results.
        </p>
      </div>

      <div className="w-full max-w-4xl">
        <TierLadder />
      </div>

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
  );
}
