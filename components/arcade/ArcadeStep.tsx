'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import {
  applyOutcomes,
  computeConfidence,
  createRankingState,
  removeGameFromState,
  syncStateWithGames,
  type GamePrior,
  type RankingOutcome,
  type RankingState,
  type Tier,
} from '@/lib/ranking';
import {
  canReveal,
  derivePhase,
  REVEAL_MIN_CONFIDENCE,
  selectRound,
  type MinigameKind,
} from '@/lib/ranking/arcade';
import { type PoolEntry, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ConfidenceMeter } from './ConfidenceMeter';
import { MINIGAMES } from './minigames';
import { RemoveGameProvider } from './RemoveGameContext';
import { tapProps } from './shared';

/** How many past kinds we keep for variety control. */
const RECENT_MEMORY = 6;

type RoundView = { kind: MinigameKind; games: Game[]; anchorId?: number; boundary?: Tier };

function poolPriors(pool: PoolEntry[]): GamePrior[] {
  return pool.map((e) => ({
    gameId: e.game.igdbId,
    rating: e.game.rating,
    popularity: e.game.popularity,
  }));
}

/**
 * Build (or resume) the hidden ranking state. A saved state is resumed with any pool drift
 * (games added/removed since it was saved) folded in via `syncStateWithGames`, so accumulated
 * rounds survive instead of being wiped when the pool changed in the meantime.
 */
function initRanking(pool: PoolEntry[], saved: RankingState | null): RankingState {
  const priors = poolPriors(pool);
  if (saved && Object.keys(saved.games).length >= 2) return syncStateWithGames(saved, priors);
  return createRankingState(priors);
}

/**
 * Step 3 — the Ranking Arcade. Drives a varied sequence of minigames off the trusted ranking
 * engine: pick a round for the current pacing phase, render it, fold its outcome(s) back into
 * the engine, autosave, and repeat. A confidence meter shows momentum; the reveal unlocks once
 * the list is "good enough."
 */
export function ArcadeStep() {
  const reduce = useReducedMotion();
  const pool = useStore((s) => s.pool);
  const setScores = useStore((s) => s.setScores);
  const step = useStore((s) => s.ui.step);
  const removeFromPool = useStore((s) => s.removeFromPool);
  const goNext = useStore((s) => s.goNext);
  const goBack = useStore((s) => s.goBack);

  const gameMap = useMemo(() => new Map(pool.map((e) => [e.game.igdbId, e.game])), [pool]);

  const [ranking, setRanking] = useState<RankingState>(() =>
    initRanking(pool, useStore.getState().scores),
  );
  const recentRef = useRef<MinigameKind[]>([]);
  const vibeSeenRef = useRef<Set<number>>(new Set());
  const [roundKey, setRoundKey] = useState(0);
  const [pendingRemoval, setPendingRemoval] = useState<Game | null>(null);

  const confidence = useMemo(() => computeConfidence(ranking).global, [ranking]);
  const phase = derivePhase(ranking, confidence);
  const ready = canReveal(confidence, ranking.round);

  // Resolve the current round's games against the pool. Recomputed whenever the engine advances.
  const view: RoundView | null = useMemo(() => {
    const round = selectRound(ranking, {
      phase,
      recentKinds: recentRef.current,
      vibeSeenIds: [...vibeSeenRef.current],
    });
    if (!round) return null;
    const games = round.gameIds.map((id) => gameMap.get(id)).filter((g): g is Game => Boolean(g));
    if (games.length < round.gameIds.length) return null;
    return { kind: round.kind, games, anchorId: round.anchorId, boundary: round.boundary };
    // roundKey is the advance signal; recentRef is a ref (read fresh each advance).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, ranking, gameMap, phase]);

  // Keep-alive: Flow never remounts this step, and while it is hidden the reveal board rewrites
  // `scores` (manual tier moves, deletes) and the pool step edits the pool. So the store is the
  // source of truth: each time the arcade becomes active, rebuild the engine from it (folding in
  // pool drift) and persist that so a refresh resumes here. After a visit elsewhere also restart
  // the round, so no minigame keeps games that may have left the pool.
  const awayRef = useRef(false);
  useEffect(() => {
    if (step !== 'arcade') {
      awayRef.current = true;
      return;
    }
    const { pool: livePool, scores } = useStore.getState();
    const next = initRanking(livePool, scores);
    setRanking(next);
    setScores(next);
    if (awayRef.current) {
      awayRef.current = false;
      setRoundKey((k) => k + 1);
    }
  }, [step, setScores]);

  const advance = useCallback(
    (outcomes: RankingOutcome[]) => {
      const kind = view?.kind;
      const next = applyOutcomes(ranking, outcomes);
      if (kind) recentRef.current = [kind, ...recentRef.current].slice(0, RECENT_MEMORY);
      if ((kind === 'vibe' || kind === 'tier-rush') && view) {
        for (const g of view.games) vibeSeenRef.current.add(g.igdbId);
      }

      setRanking(next);
      setScores(next);
      setRoundKey((k) => k + 1);
    },
    [ranking, view, setScores],
  );

  // Delete a game mid-arcade: drop it from the pool and the engine state, then discard the current
  // round (bump roundKey, keep `round`) so it's as if this round never happened.
  const confirmRemoval = useCallback(() => {
    if (!pendingRemoval) return;
    const id = pendingRemoval.igdbId;
    removeFromPool(id);
    vibeSeenRef.current.delete(id);
    const next = removeGameFromState(ranking, id);
    setRanking(next);
    setScores(next);
    setRoundKey((k) => k + 1);
    setPendingRemoval(null);
  }, [pendingRemoval, ranking, removeFromPool, setScores]);

  const reveal = () => {
    playSound('reveal');
    goNext();
  };

  const Minigame = view ? MINIGAMES[view.kind] : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-border/70 pb-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:pb-3">
        <RoundLabel phase={phase} round={ranking.round} />
        <div className="w-full sm:max-w-xs">
          <ConfidenceMeter value={confidence} ready={ready} />
        </div>
      </div>

      {/* Playfield: absorbs all the slack, and is the only thing allowed to scroll if a minigame
          still can't fit (very short landscape). `overflow-y-auto` keeps that scroll inside the
          cabinet frame instead of dragging the header and action bar off-screen with it. */}
      <div className="relative mt-3 flex min-h-0 flex-1 items-center justify-center overflow-y-auto overflow-x-hidden [container-type:size] sm:mt-5">
        <RemoveGameProvider value={setPendingRemoval}>
          {/* `popLayout` lifts the finished round out of flow while it fades, so the next one
              mounts immediately instead of waiting for the exit to finish. */}
          <AnimatePresence mode="popLayout">
            {Minigame && view ? (
              <motion.div
                key={roundKey}
                className="w-full"
                initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
              >
                <Minigame
                  games={view.games}
                  anchorId={view.anchorId}
                  boundary={view.boundary}
                  onComplete={advance}
                />
              </motion.div>
            ) : (
              <EmptyState onBack={goBack} />
            )}
          </AnimatePresence>
        </RemoveGameProvider>
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t border-border/70 pb-[env(safe-area-inset-bottom)] pt-3 sm:mt-5 sm:gap-3 sm:pt-4">
        <Button variant="ghost" onClick={goBack} className="px-3 sm:px-5">
          ← Games
        </Button>

        {view ? (
          <button
            type="button"
            {...tapProps(() =>
              advance([{ type: 'skip', gameIds: view.games.map((g) => g.igdbId) }]),
            )}
            className="label select-none whitespace-nowrap rounded-tile px-2 py-1.5 text-muted transition-colors hover:text-fg focus-visible:outline-none sm:px-3"
          >
            Skip
            <span className="hidden sm:inline"> round</span>
          </button>
        ) : (
          <span />
        )}

        <RevealCta
          ready={ready}
          near={!ready && confidence >= REVEAL_MIN_CONFIDENCE - 15}
          onReveal={reveal}
        />
      </div>

      <ConfirmDialog
        open={pendingRemoval !== null}
        title="Delete this game?"
        body="It’ll be removed from your ranking. You can re-add it later from the games step."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmRemoval}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}

/** `round` counts completed rounds, so the one being played is `round + 1`. */
function RoundLabel({ phase, round }: { phase: string; round: number }) {
  return (
    <p className="flex items-baseline gap-3">
      <span className="font-display text-lg font-black uppercase leading-none text-fg sm:text-xl">
        Round{' '}
        <span data-testid="arcade-round" className="tabular-nums">
          {round + 1}
        </span>
      </span>
      <span className="label text-muted">
        {phase === 'early' ? 'Building tiers' : 'Fine-tuning'}
      </span>
    </p>
  );
}

function RevealCta({
  ready,
  near,
  onReveal,
}: {
  ready: boolean;
  near: boolean;
  onReveal: () => void;
}) {
  const reduce = useReducedMotion();
  if (!ready) {
    return (
      <span className={cn('label text-right', near ? 'text-teal' : 'text-muted')}>
        {/* Short form on phones — the full sentence wraps to two lines next to Back + Skip at
            375px, which visibly grows the action bar. */}
        <span className="sm:hidden">{near ? 'Almost there' : 'Keep playing'}</span>
        <span className="hidden sm:inline">
          {near ? 'Almost there — keep playing' : 'Keep playing to unlock'}
        </span>
      </span>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3"
    >
      <span className="label hidden text-teal sm:inline">Your list is ready</span>
      {/* The payoff gate — give the reveal a pulsing glow so it reads as the moment it is. The
          glow is a static shadow whose opacity pulses (compositor-only, no per-frame repaint). */}
      <div className="relative rounded-control">
        {reduce ? null : (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-control shadow-[0_0_26px_rgb(var(--color-accent)/0.5)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <Button onClick={onReveal} className="whitespace-nowrap px-4 sm:px-5">
          Reveal<span className="hidden sm:inline"> my tier list</span> →
        </Button>
      </div>
    </motion.div>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface/40 p-10 text-center">
      <p className="font-display text-lg font-bold uppercase tracking-[0.04em] text-fg">
        Need a couple more games
      </p>
      <p className="max-w-sm text-sm text-muted">Add at least two games to start ranking.</p>
      <Button variant="secondary" onClick={onBack}>
        ← Back to games
      </Button>
    </div>
  );
}
