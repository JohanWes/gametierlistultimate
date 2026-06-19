'use client';

import { AnimatePresence } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchSuggestions } from '@/lib/games/client';
import type { Game } from '@/lib/games/types';
import { useStore } from '@/lib/store';

import { Button } from '../ui/Button';
import { GameCard } from '../ui/GameCard';
import { ManualSearch } from './ManualSearch';
import { PoolCard } from './PoolCard';
import { MIN_POOL, RosterMeter } from './RosterMeter';
import { StepScaffold } from './StepScaffold';

const BATCH_SIZE = 5;
/** Every Nth batch surfaces one "spotlight" card, so the played-status bonus stays rare. */
const SPOTLIGHT_EVERY = 3;

export interface PoolStepProps {
  /** Injectable for tests; defaults to the global fetch in the app. */
  fetchImpl?: typeof fetch;
}

/**
 * Step 3 — build the pool of games you've played. Cover-driven batches from the suggestions
 * API (preference-biased, exclude-aware) plus always-available manual search, gated behind a
 * roster meter that unlocks the arcade once the list is playable.
 */
export function PoolStep({ fetchImpl }: PoolStepProps = {}) {
  const prefs = useStore((s) => s.prefs);
  const poolCount = useStore((s) => s.pool.length);

  const [batch, setBatch] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState(false);
  const [spotlightId, setSpotlightId] = useState<number | null>(null);

  // Refs hold the authoritative live values the async callbacks read synchronously.
  const decidedRef = useRef<Set<number>>(new Set(useStore.getState().pool.map((e) => e.game.igdbId)));
  const batchRef = useRef<Game[]>([]);
  const batchCountRef = useRef(0);
  const fetchingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNext = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setError(false);
    setLoading(true);

    try {
      const games = await fetchSuggestions(
        { prefs, exclude: [...decidedRef.current], limit: BATCH_SIZE },
        fetchImpl ?? fetch,
      );

      batchCountRef.current += 1;
      let spotlight: number | null = null;
      if (games.length && batchCountRef.current % SPOTLIGHT_EVERY === 0) {
        spotlight = games.reduce((best, g) => ((g.rating ?? 0) > (best.rating ?? 0) ? g : best)).igdbId;
      }

      batchRef.current = games;
      setBatch(games);
      setSpotlightId(spotlight);
      setExhausted(games.length === 0);
    } catch {
      // A failed request is recoverable — surface a retry rather than a permanent dead-end.
      // Also auto-retry shortly, to ride out a dev cold-start or slow first connection.
      setError(true);
      retryTimerRef.current = setTimeout(() => void fetchNext(), 1500);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [prefs, fetchImpl]);

  // Load the first batch on mount.
  useEffect(() => {
    void fetchNext();
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDecide = (id: number) => {
    decidedRef.current.add(id);
    const next = batchRef.current.filter((g) => g.igdbId !== id);
    batchRef.current = next;
    setBatch(next);
    if (next.length === 0) void fetchNext();
  };

  const showSkeletons = loading && batch.length === 0;

  return (
    <StepScaffold
      eyebrow="Step 3 · Your games"
      title="Add the games you’ve played."
      description="Wave through a few at a time, or search for anything. Aim for 20+ to get a sharp list — your list stays yours, so include only what you’ve actually played."
      nextLabel="Enter the arcade →"
      nextDisabled={poolCount < MIN_POOL}
    >
      <div className="flex flex-col gap-6">
        <ManualSearch fetchImpl={fetchImpl} />

        <div className="min-h-[20rem]">
          {showSkeletons ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: BATCH_SIZE }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-cabinet"
                >
                  <GameCard loading />
                  <div className="h-9 w-full" />
                </div>
              ))}
            </div>
          ) : error && batch.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-coin/50 bg-surface/40 p-10 text-center">
              <p className="font-display text-lg font-bold uppercase tracking-[0.04em] text-fg">
                Couldn’t load suggestions
              </p>
              <p className="max-w-sm text-sm text-muted">
                The game library didn’t respond — this can happen on the first load. Retrying
                automatically…
              </p>
              <Button variant="secondary" onClick={() => void fetchNext()}>
                Retry now
              </Button>
            </div>
          ) : exhausted && batch.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface/40 p-10 text-center">
              <p className="font-display text-lg font-bold uppercase tracking-[0.04em] text-fg">
                That’s our whole shelf for now
              </p>
              <p className="max-w-sm text-sm text-muted">
                You’ve reviewed every suggestion that fits. Use search above to add any game by
                name, then enter the arcade.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <AnimatePresence mode="popLayout">
                {batch.map((game) => (
                  <PoolCard
                    key={game.igdbId}
                    game={game}
                    spotlight={game.igdbId === spotlightId}
                    onDecide={() => handleDecide(game.igdbId)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        <RosterMeter count={poolCount} />
      </div>
    </StepScaffold>
  );
}
