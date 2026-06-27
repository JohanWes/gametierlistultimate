'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import {
  assignTier,
  computeTiers,
  createRankingState,
  parseRankingState,
  removeGameFromState,
  serializeRankingState,
  TIER_ORDER,
  type RankingState,
  type Tier,
  type TierMap,
} from '@/lib/ranking';
import { playSound } from '@/lib/sound';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { CommunityComparison } from './CommunityComparison';
import { moveInTierMap, removeFromTierMap } from './dnd';
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
  const removeFromPool = useStore((s) => s.removeFromPool);
  const goBack = useStore((s) => s.goBack);
  const soundOn = useStore((s) => s.ui.soundOn);
  const step = useStore((s) => s.ui.step);

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
  const [pendingRemoval, setPendingRemoval] = useState<Game | null>(null);

  const ding = useCallback(
    (_tier: Tier, isLast: boolean) => {
      // Keep-alive: ResultStep stays mounted when hidden. Don't play reveal sounds
      // while the user is on another step.
      if (step !== 'reveal') return;
      if (soundOn) playSound(isLast ? 'success' : 'reveal');
    },
    [soundOn, step],
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

  // The S-tier crescendo: fires once when the last tier lands, then clears so the one-shot CSS/
  // particle animations unmount. Skipped under reduced motion (the board just settles).
  const [coronate, setCoronate] = useState(false);
  useEffect(() => {
    if (!done || reduce || step !== 'reveal') return;
    setCoronate(true);
    const id = window.setTimeout(() => setCoronate(false), 2600);
    return () => window.clearTimeout(id);
  }, [done, reduce, step]);

  const move = useCallback(
    (gameId: number, from: Tier, to: Tier, toIndex?: number) => {
      setTiers((prev) => moveInTierMap(prev, gameId, to, toIndex));
      // Only a cross-tier move changes the engine's rating (and thus what persists/round-trips
      // for the owner). Within-tier reordering is a session + share concern: it lives in `tiers`
      // and the published snapshot, but reverts to rating-sorted order on owner reload.
      if (to !== from) {
        const updated = assignTier(rankingRef.current as RankingState, gameId, to);
        rankingRef.current = updated;
        // Persist via the existing autosave (scores change → debounced localStorage write).
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

  const confirmRemoval = useCallback(() => {
    if (!pendingRemoval) return;
    const id = pendingRemoval.igdbId;
    removeFromPool(id);
    rankingRef.current = removeGameFromState(rankingRef.current as RankingState, id);
    setScores(serializeRankingState(rankingRef.current) as unknown as Record<string, unknown>);
    setTiers((prev) => removeFromTierMap(prev, id));
    setPendingRemoval(null);
  }, [pendingRemoval, removeFromPool, setScores]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.22em] text-teal">
            Step 5 · Your tier list
          </p>
          <h1 className="font-display text-4xl font-black uppercase leading-[0.95] tracking-[0.02em] text-fg sm:text-5xl">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={done ? 'done' : 'building'}
                className="block"
                initial={reduce ? false : { opacity: 0, y: 8, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(6px)' }}
                transition={{ duration: 0.32, ease: 'easeOut' }}
              >
                {done ? 'Here’s where they landed.' : 'Building the ladder…'}
              </motion.span>
            </AnimatePresence>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            {done
              ? 'Not quite right? Drag a cover to another tier, or tap it to pick one.'
              : 'F lands first. Each stronger tier drops in above it until S takes the top.'}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-end">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={goBack}>
              ← Keep ranking
            </Button>
            {!done ? (
              <Button variant="secondary" onClick={skip}>
                Reveal all →
              </Button>
            ) : null}
          </div>
          {done ? <CommunityComparison tiers={tiers} gamesById={gamesById} /> : null}
        </div>
      </div>

      <motion.div
        className="mt-6"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className={cn(coronate && 'coronation-shake')}>
          <TierBoard
            tiers={tiers}
            gamesById={gamesById}
            visibleTiers={done ? undefined : revealed}
            onMove={done ? move : undefined}
            onPick={done ? (game, from) => setPicking({ game, from }) : undefined}
            onRemove={done ? (game) => setPendingRemoval(game) : undefined}
            coronate={coronate}
          />
        </div>
      </motion.div>

      {done ? <ShareBar tiers={tiers} gamesById={gamesById} /> : null}

      <TierPicker
        game={picking?.game ?? null}
        current={picking ? tierOf(tiers, picking.game.igdbId) : null}
        onPick={handlePick}
        onClose={() => setPicking(null)}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Delete this game?"
        body="It’ll be removed from your tier list. You can re-add it later from the games step."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}
