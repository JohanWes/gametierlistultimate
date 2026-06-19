'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import {
  assignTier,
  computeTiers,
  createRankingState,
  parseRankingState,
  serializeRankingState,
  TIER_ORDER,
  type RankingState,
  type Tier,
  type TierMap,
} from '@/lib/ranking';
import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';

import { Button } from '../../ui/Button';
import { moveInTierMap } from './dnd';
import { ShareBar } from './ShareBar';
import { TierBoard } from './TierBoard';
import { TierPicker } from './TierPicker';
import { useReveal } from './useReveal';

/** Which tier currently holds a game (for marking it in the picker). */
function tierOf(tiers: TierMap, gameId: number): Tier | null {
  for (const tier of TIER_ORDER) {
    if (tiers[tier].includes(gameId)) return tier;
  }
  return null;
}

/**
 * Step 5 — the payoff. Computes the final tiers, reveals them bottom-up (S last), then hands the
 * same board over for free editing: drag a cover to another row, or tap it to pick a tier. A share
 * action at the bottom publishes a link. Phases 8 + 9 live on this one screen.
 */
export function ResultStep() {
  const reduce = useReducedMotion();
  const pool = useStore((s) => s.pool);
  const setScores = useStore((s) => s.setScores);
  const goBack = useStore((s) => s.goBack);
  const soundOn = useStore((s) => s.ui.soundOn);

  const gamesById = useMemo(() => new Map(pool.map((e) => [e.game.igdbId, e.game])), [pool]);

  // Seed the engine state once (from saved scores, else the pool) and keep it as the persistence
  // source of truth. The displayed layout lives in `tiers` state so manual moves are instant.
  const rankingRef = useRef<RankingState | null>(null);
  if (rankingRef.current === null) {
    rankingRef.current =
      parseRankingState(useStore.getState().scores) ??
      createRankingState(
        pool.map((e) => ({
          gameId: e.game.igdbId,
          rating: e.game.rating,
          popularity: e.game.popularity,
        })),
      );
  }

  const [tiers, setTiers] = useState<TierMap>(() => computeTiers(rankingRef.current as RankingState));
  const [picking, setPicking] = useState<{ game: Game; from: Tier } | null>(null);

  const ding = useCallback(
    (_tier: Tier, isLast: boolean) => {
      if (soundOn) playSound(isLast ? 'success' : 'reveal');
    },
    [soundOn],
  );

  const { revealed, done, skip } = useReveal({
    instant: reduce ?? false,
    intervalMs: 460,
    onReveal: ding,
  });

  // Reduced motion reveals everything at once — still give it one cue.
  useEffect(() => {
    if (reduce && soundOn) playSound('reveal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = useCallback(
    (gameId: number, from: Tier, to: Tier, toIndex?: number) => {
      setTiers((prev) => moveInTierMap(prev, gameId, to, toIndex));
      // Only a cross-tier move changes the engine's rating (and thus what persists/round-trips
      // for the owner). Within-tier reordering is a session + share concern: it lives in `tiers`
      // and the published snapshot, but reverts to rating-sorted order on owner reload.
      if (to !== from) {
        const updated = assignTier(rankingRef.current as RankingState, gameId, to);
        rankingRef.current = updated;
        // Persist via the existing autosave (scores change → debounced PUT /api/session).
        setScores(serializeRankingState(updated) as unknown as Record<string, unknown>);
      }
      if (soundOn) playSound('blip');
    },
    [setScores, soundOn],
  );

  const handlePick = useCallback(
    (to: Tier) => {
      if (!picking) return;
      if (to !== picking.from) move(picking.game.igdbId, picking.from, to);
      setPicking(null);
    },
    [picking, move],
  );

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-teal">
            Step 5 · Your tier list
          </p>
          <h1 className="font-display text-4xl font-black uppercase leading-[0.95] tracking-[0.02em] text-fg sm:text-5xl">
            {done ? 'Here’s where they landed.' : 'Counting down…'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            {done
              ? 'Not quite right? Drag a cover to another tier, or tap it to pick one.'
              : 'Revealing from F up to S. S lands last.'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Button variant="ghost" onClick={goBack}>
            ← Keep ranking
          </Button>
          {!done ? (
            <Button variant="secondary" onClick={skip}>
              Reveal all →
            </Button>
          ) : null}
        </div>
      </div>

      <motion.div
        className="mt-6"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <TierBoard
          tiers={tiers}
          gamesById={gamesById}
          visibleTiers={done ? undefined : revealed}
          onMove={done ? move : undefined}
          onPick={done ? (game, from) => setPicking({ game, from }) : undefined}
        />
      </motion.div>

      {done ? <ShareBar tiers={tiers} gamesById={gamesById} /> : null}

      <TierPicker
        game={picking?.game ?? null}
        current={picking ? tierOf(tiers, picking.game.igdbId) : null}
        onPick={handlePick}
        onClose={() => setPicking(null)}
      />
    </div>
  );
}
