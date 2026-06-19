'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import type { Game } from '@/lib/games/types';
import { TIER_ORDER, type Tier } from '@/lib/ranking';
import { cn } from '@/lib/utils';

// Static class maps keep Tailwind's scanner happy (no dynamic class strings).
const TIER_BG: Record<Tier, string> = {
  S: 'bg-tier-s',
  A: 'bg-tier-a',
  B: 'bg-tier-b',
  C: 'bg-tier-c',
  D: 'bg-tier-d',
  E: 'bg-tier-e',
  F: 'bg-tier-f',
};

export interface TierPickerProps {
  /** The game being moved, or null when the picker is closed. */
  game: Game | null;
  /** The game's current tier (marked as "now"). */
  current: Tier | null;
  onPick: (to: Tier) => void;
  onClose: () => void;
}

/**
 * Touch-first move control: a sheet of the seven tier blocks (a small echo of the board's own
 * spectrum) so the choice mirrors where the cover will land. Large tap targets, mouse + touch.
 */
export function TierPicker({ game, current, onPick, onClose }: TierPickerProps) {
  const reduce = useReducedMotion();
  const open = game !== null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="Cancel move"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
          />

          <motion.div
            role="dialog"
            aria-label={`Move ${game.title}`}
            initial={reduce ? false : { y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="relative z-10 w-full max-w-lg rounded-t-card border-2 border-border bg-panel p-5 shadow-cabinet sm:rounded-card"
          >
            <p className="mb-1 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-teal">
              Move to tier
            </p>
            <h2 className="mb-4 truncate font-display text-2xl font-black uppercase tracking-[0.02em] text-fg">
              {game.title}
            </h2>

            <div className="grid grid-cols-7 gap-1.5">
              {TIER_ORDER.map((tier) => {
                const isCurrent = tier === current;
                return (
                  <button
                    key={tier}
                    type="button"
                    aria-label={`Move to ${tier} tier`}
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => onPick(tier)}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      onPick(tier);
                    }}
                    className={cn(
                      'flex aspect-square items-center justify-center rounded-tile font-display text-xl font-extrabold text-black/85 shadow-soft transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95',
                      TIER_BG[tier],
                      isCurrent ? 'ring-2 ring-fg' : 'opacity-90',
                    )}
                  >
                    {tier}
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-center font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted">
              {current ? `Currently in ${current}` : 'Pick a new tier'} · tap outside to cancel
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
