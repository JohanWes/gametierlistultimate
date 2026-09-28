'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';

import { TIER_ORDER, tierScore, type RankingOutcome, type Tier } from '@/lib/ranking';
import { playSound } from '@/lib/sound';
import { cn } from '@/lib/utils';

import { TIER_BG } from '../../ui/Row';
import { tapProps, useComplete } from '../shared';
import type { MinigameProps } from '../types';
import { ArcadeCard } from './ArcadeCard';

/** How long each card waits for a call before it slips past as "no call". */
export const FUSE_MS = 4000;

/** Beat held on the finished strip before the round resolves. */
const RECAP_MS = 700;

/**
 * Minigame — "Tier Rush." Covers are dealt one at a time; tap a tier lane before the fuse burns
 * out. Gut calls, fast: each call is an absolute placement (`vibe` at the tier's score), so eight
 * cards in ~20 seconds bank a lot of tier confidence. A card whose fuse runs out is skipped.
 */
export function TierRush({ games, onComplete }: MinigameProps) {
  const reduce = useReducedMotion();
  const complete = useComplete(onComplete);
  const [calls, setCalls] = useState<(Tier | null)[]>([]);

  const index = calls.length;
  const current = games[index];
  const done = index >= games.length;

  const call = useCallback(
    (tier: Tier | null) => {
      playSound(tier ? 'click' : 'blip');
      // Guard on the index so a late fuse can't double-record the same card.
      setCalls((prev) => (prev.length === index ? [...prev, tier] : prev));
    },
    [index],
  );

  useEffect(() => {
    if (done) return;
    const timer = window.setTimeout(() => call(null), FUSE_MS);
    return () => window.clearTimeout(timer);
  }, [call, done]);

  useEffect(() => {
    if (!done || games.length === 0) return;
    playSound('success');
    const outcomes: RankingOutcome[] = games.map((g, i) => {
      const tier = calls[i];
      return tier
        ? { type: 'vibe', gameId: g.igdbId, score: tierScore(tier) }
        : { type: 'skip', gameIds: [g.igdbId] };
    });
    complete(outcomes, RECAP_MS);
  }, [done, games, calls, complete]);

  if (games.length === 0) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
      <header className="mb-2 flex w-full items-baseline justify-between gap-3 sm:mb-4">
        <h2 className="font-display text-xl font-black uppercase tracking-[0.02em] text-fg sm:text-2xl">
          Tier rush
        </h2>
        <p className="text-sm font-medium text-fg/80">Gut call. Don’t think.</p>
      </header>

      {/* Tally strip: one slot per card, filled with the call as it lands. */}
      <ol
        className="mb-3 grid w-full grid-cols-8 gap-1 sm:mb-5 sm:gap-1.5"
        aria-label="Calls so far"
      >
        {games.map((g, i) => {
          const tier = calls[i];
          return (
            <li
              key={g.igdbId}
              className={cn(
                'flex h-6 items-center justify-center rounded-hardware font-display text-sm font-black sm:h-8 sm:text-base',
                tier ? cn(TIER_BG[tier], 'text-black/85') : 'border border-border text-muted',
                i === index && 'border-teal text-teal',
              )}
            >
              {tier ?? (i < index ? '–' : '')}
            </li>
          );
        })}
      </ol>

      <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-8">
        <div className="flex flex-col items-center gap-2">
          <div className="relative flex aspect-[3/4] w-[var(--cover-rush)] items-center justify-center">
            <AnimatePresence mode="popLayout" initial={false}>
              {current ? (
                <motion.div
                  key={current.igdbId}
                  initial={reduce ? false : { opacity: 0, y: -24, rotate: -3 }}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  exit={
                    reduce
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.7, transition: { duration: 0.14 } }
                  }
                  transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                >
                  <ArcadeCard game={current} size="rush" />
                </motion.div>
              ) : (
                <p className="font-display text-2xl font-black uppercase text-teal">Called it</p>
              )}
            </AnimatePresence>
          </div>
          {/* Fuse: burns down over FUSE_MS. Restarted per card via the key. */}
          <div className="h-1.5 w-[var(--cover-rush)] overflow-hidden rounded-full bg-surface-elevated">
            {current ? (
              <div
                key={current.igdbId}
                className="h-full origin-left rounded-full bg-accent"
                style={{ animation: `rush-fuse ${FUSE_MS}ms linear forwards` }}
              />
            ) : null}
          </div>
        </div>

        {/* Lanes: a thumb row under the card on phones, a side rail from sm up. */}
        <div className="grid w-full grid-cols-7 gap-1.5 sm:w-auto sm:grid-cols-1 sm:gap-2">
          {TIER_ORDER.map((tier) => (
            <button
              key={tier}
              type="button"
              aria-label={`${tier} tier`}
              disabled={done}
              {...tapProps(() => {
                if (!done) call(tier);
              })}
              className={cn(
                'flex h-12 items-center justify-center rounded-tile font-display text-xl font-extrabold text-black/85 shadow-soft transition-transform duration-100 hover:brightness-110 active:scale-95 disabled:opacity-40 sm:h-[calc(var(--cover-rush)*4/3/7-0.43rem)] sm:min-h-9 sm:w-20',
                TIER_BG[tier],
              )}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
