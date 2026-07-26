'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import { Button } from '../ui/Button';
import { TIER_ORDER, type Tier } from '../ui/Row';
import { AttractCabinet } from './AttractCabinet';

/** How long the coin-insert beat holds before the flow advances (coin fall + credit flash). */
const COIN_BEAT_MS = 680;

/**
 * The coin-op CTA. At rest the label hard-blinks INSERT COIN / PRESS START (the classic
 * attract-mode idiom — instant on/off, no fade). Pressing it drops a coin into the slit on the
 * button face, flashes the button as the credit registers, then advances the flow. Reduced
 * motion gets a static label and an instant advance.
 */
function StartButton() {
  const goNext = useStore((s) => s.goNext);
  const reduce = useReducedMotion();
  const [inserting, setInserting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <Button
      size="lg"
      aria-label="Press start"
      aria-busy={inserting}
      className={cn('relative pl-10', inserting && 'coin-accept')}
      onClick={() => {
        if (inserting) return;
        playSound('coin');
        if (reduce) {
          goNext();
          return;
        }
        setInserting(true);
        timer.current = setTimeout(() => {
          timer.current = null;
          setInserting(false);
          goNext();
        }, COIN_BEAT_MS);
      }}
    >
      <span aria-hidden className="coin-slot">
        {inserting ? <span className="coin-drop" /> : null}
      </span>
      {reduce ? (
        <>Press start →</>
      ) : (
        <span aria-hidden className="grid text-center">
          <span className="coin-label">Insert coin</span>
          <span className="coin-label coin-label-alt">Press start →</span>
        </span>
      )}
    </Button>
  );
}

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
      // Mobile is a single ordered column (headline → CTA → cabinet → explainer); `lg` restores the
      // original two-column composition, now over three rows since the CTA and the explainer are
      // separate grid items rather than one stacked block.
      className="flex flex-1 flex-col items-center gap-4 py-1 text-center sm:gap-6 sm:py-2 lg:grid lg:grid-cols-2 lg:grid-rows-[auto_auto_auto] lg:items-center lg:gap-x-12 lg:gap-y-6 lg:text-left"
    >
      {/* Headline — row 1, left column on desktop; first on mobile. */}
      <motion.div
        variants={item}
        className="order-1 flex flex-col items-center lg:order-none lg:col-start-1 lg:row-start-1 lg:items-start"
      >
        <h1 className="font-display text-4xl font-black uppercase leading-[0.9] tracking-[0.02em] text-fg sm:text-6xl">
          Game Tier List Ultimate
        </h1>
        <p className="mt-2 max-w-xl text-balance text-sm uppercase tracking-[0.18em] text-muted sm:mt-3 sm:text-base">
          Rank the best games you&rsquo;ve played — through quick matchups, not drag-and-drop.
        </p>
        <SpectrumRule />
      </motion.div>

      {/* CTA — on mobile this is pulled above the cabinet so "Insert coin" is reachable without
          scrolling past seven cabinet rows and four explainer cards; the cabinet and the
          explainer then continue below for anyone who wants them. Welcome is a one-time screen,
          so scrolling *is* fine here — being unable to start without it was not. On desktop the
          original order is restored via grid placement. */}
      <motion.div
        variants={item}
        className="relative order-2 mx-auto lg:order-none lg:col-start-1 lg:row-start-3 lg:mx-0 lg:justify-self-start"
      >
        {!reduce ? (
          <span
            aria-hidden
            className="absolute -inset-1 rounded-control bg-accent/30 blur-md animate-pulse-glow"
          />
        ) : null}
        <StartButton />
      </motion.div>

      {/* Cabinet — right column spanning both rows on desktop; below the CTA on mobile. */}
      <motion.div
        variants={item}
        className="order-3 w-full lg:order-none lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-center"
      >
        <AttractCabinet active={step === 'welcome'} />
      </motion.div>

      <motion.div
        variants={item}
        className="order-4 w-full max-w-xl lg:order-none lg:col-start-1 lg:row-start-2 lg:self-start"
      >
        <HowItWorks itemVariants={item} />
      </motion.div>
    </motion.div>
  );
}
