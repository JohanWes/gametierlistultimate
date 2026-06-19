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
  serializeRankingState,
  type RankingOutcome,
  type RankingState,
  type Tier,
} from '@/lib/ranking';
import { canReveal, derivePhase, selectRound, type MinigameKind } from '@/lib/ranking/arcade';
import { type PoolEntry, useStore } from '@/lib/store';

import { Button } from '../ui/Button';
import { ConfidenceMeter } from './ConfidenceMeter';
import { MINIGAMES } from './minigames';
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
  const [roundKey, setRoundKey] = useState(0);

  const confidence = useMemo(() => computeConfidence(ranking).global, [ranking]);
  const phase = derivePhase(ranking, confidence);
  const ready = canReveal(confidence, ranking.round);

  // Resolve the current round's games against the pool. Recomputed whenever the engine advances.
  const view: RoundView | null = useMemo(() => {
    const round = selectRound(ranking, { phase, recentKinds: recentRef.current });
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

      const nextConfidence = computeConfidence(next).global;
      setRanking(next);
      setScores(toScores(next));
      setArcade({ phase: derivePhase(next, nextConfidence), round: next.round });
      setRoundKey((k) => k + 1);
    },
    [ranking, view, setScores, setArcade],
  );

  const reveal = () => {
    playSound('reveal');
    goNext();
  };

  const Minigame = view ? MINIGAMES[view.kind] : null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.22em] text-teal">
            Step 4 · Ranking arcade
          </p>
          <p className="max-w-md text-sm leading-6 text-muted">
            Make quick calls. Each one sharpens your list — reveal whenever it feels right.
          </p>
        </div>
        <PhaseBadge phase={phase} round={ranking.round} />
      </div>

      <div className="mt-5">
        <ConfidenceMeter value={confidence} ready={ready} />
      </div>

      <div className="relative mt-8 flex flex-1 items-center justify-center">
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
      </div>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
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

        <RevealCta ready={ready} onReveal={reveal} />
      </div>
    </div>
  );
}

function PhaseBadge({ phase, round }: { phase: string; round: number }) {
  const label = phase === 'early' ? 'Building tiers' : 'Fine-tuning';
  return (
    <div className="flex shrink-0 items-center gap-3 rounded-tile border border-border bg-surface/60 px-3 py-2 shadow-soft">
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-muted">Round</span>
      <span data-testid="arcade-round" className="font-display text-xl font-black tabular-nums text-fg">
        {round}
      </span>
      <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-teal">{label}</span>
    </div>
  );
}

function RevealCta({ ready, onReveal }: { ready: boolean; onReveal: () => void }) {
  if (!ready) {
    return (
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted/70">
        Keep playing to unlock
      </span>
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
      <Button onClick={onReveal}>Reveal my tier list →</Button>
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
