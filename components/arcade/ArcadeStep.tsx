'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Game } from '@/lib/games/types';
import { playSound } from '@/lib/sound';
import {
  applyOutcome,
  computeConfidence,
  createRankingState,
  parseRankingState,
  removeGameFromState,
  serializeRankingState,
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

const RECENT_MEMORY = 6;

/** How many past kinds we keep for variety control. */
type RoundView = { kind: MinigameKind; games: Game[]; anchorId?: number; boundary?: Tier };

/**
 * Build (or resume) the hidden ranking state. We resume the saved state only when it already
 * covers the current pool; otherwise we start fresh from the pool's priors.
 */
function initRanking(pool: PoolEntry[], saved: Record<string, unknown>): RankingState {
  const parsed = parseRankingState(saved);
  if (parsed) {
    const covered = pool.every((e) => parsed.games[String(e.game.igdbId)]);
    if (covered && Object.keys(parsed.games).length >= 2) return parsed;
  }
  return createRankingState(
    pool.map((e) => ({
      gameId: e.game.igdbId,
      rating: e.game.rating,
      popularity: e.game.popularity,
    })),
  );
}

/** The store keeps `scores` opaque; serialize into that shape. */
function toScores(state: RankingState): Record<string, unknown> {
  return serializeRankingState(state) as unknown as Record<string, unknown>;
}

/**
 * Step 4 — the Ranking Arcade. Drives a varied sequence of minigames off the trusted ranking
 * engine: pick a round for the current pacing phase, render it, fold its outcome(s) back into
 * the engine, autosave, and repeat. A confidence meter shows momentum; the reveal unlocks once
 * the list is "good enough."
 */
export function ArcadeStep() {
  const reduce = useReducedMotion();
  const pool = useStore((s) => s.pool);
  const setScores = useStore((s) => s.setScores);
  const setArcade = useStore((s) => s.setArcade);
  const removeFromPool = useStore((s) => s.removeFromPool);
  const goNext = useStore((s) => s.goNext);
  const goBack = useStore((s) => s.goBack);

  const gameMap = useMemo(
    () => new Map(pool.map((e) => [e.game.igdbId, e.game])),
    [pool],
  );

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
    const games = round.gameIds
      .map((id) => gameMap.get(id))
      .filter((g): g is Game => Boolean(g));
    if (games.length < round.gameIds.length) return null;
    return { kind: round.kind, games, anchorId: round.anchorId, boundary: round.boundary };
    // roundKey is the advance signal; recentRef is a ref (read fresh each advance).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, ranking, gameMap, phase]);

  // Persist the initial state once so a refresh resumes mid-arcade.
  useEffect(() => {
    setScores(toScores(ranking));
    setArcade({ phase, round: ranking.round });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = useCallback(
    (outcomes: RankingOutcome[]) => {
      const kind = view?.kind;
      const next = outcomes.reduce((s, o) => applyOutcome(s, o), ranking);
      if (kind) recentRef.current = [kind, ...recentRef.current].slice(0, RECENT_MEMORY);
      if (kind === 'vibe' && view) {
        for (const g of view.games) vibeSeenRef.current.add(g.igdbId);
      }

      const nextConfidence = computeConfidence(next).global;
      setRanking(next);
      setScores(toScores(next));
      setArcade({ phase: derivePhase(next, nextConfidence), round: next.round });
      setRoundKey((k) => k + 1);
    },
    [ranking, view, setScores, setArcade],
  );

  // Delete a game mid-arcade: drop it from the pool and the engine state, then discard the current
  // round (bump roundKey, keep `round`) so it's as if this round never happened.
  const confirmRemoval = useCallback(() => {
    if (!pendingRemoval) return;
    const id = pendingRemoval.igdbId;
    removeFromPool(id);
    vibeSeenRef.current.delete(id);
    const next = removeGameFromState(ranking, id);
    const nextConfidence = computeConfidence(next).global;
    setRanking(next);
    setScores(toScores(next));
    setArcade({ phase: derivePhase(next, nextConfidence), round: next.round });
    setRoundKey((k) => k + 1);
    setPendingRemoval(null);
  }, [pendingRemoval, ranking, removeFromPool, setScores, setArcade]);

  const reveal = () => {
    playSound('reveal');
    goNext();
  };

  const Minigame = view ? MINIGAMES[view.kind] : null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border/70 pb-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:pb-3">
        <div className="flex items-center gap-3">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-teal">
            <span className="sm:hidden">Arcade</span>
            <span className="hidden sm:inline">Step 4 · Ranking arcade</span>
          </p>
          <PhaseBadge phase={phase} round={ranking.round} />
        </div>
        <div className="w-full sm:max-w-xs">
          <ConfidenceMeter value={confidence} ready={ready} compact />
        </div>
      </div>

      <div className="relative mt-3 flex flex-1 items-center justify-center sm:mt-5">
        <RemoveGameProvider value={setPendingRemoval}>
          <AnimatePresence mode="wait">
            {Minigame && view ? (
              <motion.div
                key={roundKey}
                className="w-full"
                initial={reduce ? false : { opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.02 }}
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

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-3 sm:mt-5 sm:pt-4">
        <Button variant="ghost" onClick={goBack}>
          ← Games
        </Button>

        {view ? (
          <button
            type="button"
            {...tapProps(() => advance([{ type: 'skip', gameIds: view.games.map((g) => g.igdbId) }]))}
            className="select-none rounded-tile px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-muted transition-colors hover:text-fg focus-visible:outline-none"
          >
            Skip round
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

function PhaseBadge({ phase, round }: { phase: string; round: number }) {
  const label = phase === 'early' ? 'Building tiers' : 'Fine-tuning';
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-tile border border-border bg-surface/60 px-2.5 py-1 shadow-soft">
      <span className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-muted">Round</span>
      <span
        data-testid="arcade-round"
        className="font-display text-base font-black tabular-nums text-fg"
      >
        {round}
      </span>
      <span className="hidden font-mono text-[0.58rem] uppercase tracking-[0.14em] text-teal sm:inline">
        {label}
      </span>
    </div>
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
      <motion.span
        className={cn(
          'font-mono text-[0.7rem] uppercase tracking-[0.16em]',
          near ? 'text-teal' : 'text-muted/70',
        )}
        animate={near && !reduce ? { opacity: [0.6, 1, 0.6] } : { opacity: 1 }}
        transition={near && !reduce ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >
        {near ? 'Almost there — keep playing' : 'Keep playing to unlock'}
      </motion.span>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3"
    >
      <span className="hidden font-mono text-[0.7rem] uppercase tracking-[0.16em] text-teal sm:inline">
        Your list is ready
      </span>
      {/* The payoff gate — give the reveal a pulsing glow so it reads as the moment it is. */}
      <motion.div
        className="rounded-control"
        animate={
          reduce
            ? undefined
            : {
                boxShadow: [
                  '0 0 0 rgb(var(--color-accent) / 0)',
                  '0 0 26px rgb(var(--color-accent) / 0.5)',
                  '0 0 0 rgb(var(--color-accent) / 0)',
                ],
              }
        }
        transition={reduce ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Button onClick={onReveal}>Reveal my tier list →</Button>
      </motion.div>
    </motion.div>
  );
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface/40 p-10 text-center">
      <p className="font-display text-lg font-bold uppercase tracking-[0.04em] text-fg">
        Need a couple more games
      </p>
      <p className="max-w-sm text-sm text-muted">
        Add at least two games to start ranking.
      </p>
      <Button variant="secondary" onClick={onBack}>
        ← Back to games
      </Button>
    </div>
  );
}
