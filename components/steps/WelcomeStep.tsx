'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import { Button } from '../ui/Button';
import { AttractCabinet } from './AttractCabinet';

/** How long the coin-insert beat holds before the flow advances (coin fall + credit flash). */
const COIN_BEAT_MS = 320;

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

const STEPS: { label: string; detail: string }[] = [
  { label: 'Choose games', detail: 'Tap the ones you’ve played.' },
  { label: 'Play rounds', detail: 'Quick matchups, no forms.' },
  { label: 'Get your list', detail: 'A personal S–F ranking.' },
];

/** The three beats of the flow, as a plain ordered list. */
function HowItWorks({ itemVariants }: { itemVariants: Variants }) {
  return (
    <ol className="grid w-full gap-3 text-left sm:grid-cols-3 sm:gap-5">
      {STEPS.map((step, i) => (
        <motion.li key={step.label} variants={itemVariants} className="flex items-baseline gap-2.5">
          <span className="font-display text-lg font-black tabular-nums text-accent">{i + 1}</span>
          <span>
            <span className="block font-display text-sm font-bold uppercase tracking-[0.04em] text-fg">
              {step.label}
            </span>
            <span className="block text-sm leading-snug text-muted">{step.detail}</span>
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
      // Mobile is a single ordered column (headline → CTA → cabinet → explainer). On `lg` the text
      // column becomes one vertically-centred stack beside the cabinet; below `lg` that wrapper is
      // `display: contents`, so its children join the outer column and `order` interleaves them.
      className="flex flex-1 flex-col items-center gap-6 py-1 text-center sm:gap-8 sm:py-2 lg:flex-row lg:items-center lg:justify-center lg:gap-16 lg:text-left"
    >
      <div className="contents lg:flex lg:max-w-2xl lg:flex-col lg:items-start lg:gap-8">
        <motion.div
          variants={item}
          className="order-1 flex flex-col items-center lg:order-none lg:items-start"
        >
          <h1 className="font-display text-4xl font-black uppercase leading-[0.9] tracking-[0.02em] text-fg sm:text-6xl">
            Game Tier List Ultimate
          </h1>
          <p className="mt-3 max-w-[40ch] text-balance text-base leading-relaxed text-muted sm:mt-4 sm:text-lg">
            Rank the best games you&rsquo;ve played — through quick matchups, not drag-and-drop.
          </p>
        </motion.div>

        {/* CTA — on mobile it sits above the cabinet so "Insert coin" is reachable without
            scrolling past seven cabinet rows. */}
        <motion.div variants={item} className="order-2 lg:order-none">
          <StartButton />
        </motion.div>

        <motion.div variants={item} className="order-4 w-full max-w-2xl lg:order-none">
          <HowItWorks itemVariants={item} />
        </motion.div>
      </div>

      <motion.div variants={item} className="order-3 w-full lg:order-none lg:w-auto">
        <AttractCabinet active={step === 'welcome'} />
      </motion.div>
    </motion.div>
  );
}
