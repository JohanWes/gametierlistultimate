'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchSuggestions } from '@/lib/games/client';
import { peekStarterBatch } from '@/lib/games/prefetch';
import type { Game } from '@/lib/games/types';
import { STARTER_GAME_NAMES } from '@/lib/games/starter-set';
import { useIsMobile } from '@/lib/use-is-mobile';
import { useStore } from '@/lib/store';

import { Button } from '../ui/Button';
import { GameCard } from '../ui/GameCard';
import { ManualSearch } from './ManualSearch';
import { PoolCard, type PoolDecision } from './PoolCard';
import { PoolSwipeDeck } from './PoolSwipeDeck';
import { MIN_POOL, RosterMeter } from './RosterMeter';
import { StepScaffold } from './StepScaffold';

export const VISIBLE_SLOTS = 3;
const REFILL_AT = 2;
/**
 * Curated starter shelf handoff. The first few batches pull the preset shelf so the user's
 * accepts can branch into the pre-seeded persona co-occurrence clusters. We stop asking for the
 * preset once the shelf is drained (36 games / 3 per batch ≈ 12 batches) OR the user has accepted
 * 3 games — at that point personalization has enough signal to take over. The server also
 * ignores `preset` once `seedIds` is non-empty, so this is a defense-in-depth toggle.
 */
const PRESET_BATCH_LIMIT = Math.ceil(STARTER_GAME_NAMES.length / VISIBLE_SLOTS);
const PRESET_ACCEPT_HANDOFF = 3;

export interface PoolStepProps {
  fetchImpl?: typeof fetch;
  /** Injected RNG forwarded to each PoolCard's spotlight roll; defaults to Math.random. */
  random?: () => number;
}

interface SlotEntry {
  game: Game;
}

/**
 * Step 3 — build the pool of games you've played. Three large fixed slots always stay on screen.
 * Deciding a card fades it out and a fresh one from a hidden backlog fades into the same slot;
 * the other two never move. The backlog is prefetched in the background so replacements
 * appear instantly. (Mobile uses a separate single-card swipe deck — see PoolSwipeDeck.)
 */
export function PoolStep({ fetchImpl, random }: PoolStepProps = {}) {
  const prefs = useStore((s) => s.prefs);
  const poolCount = useStore((s) => s.pool.length);
  const reduce = useReducedMotion();
  const isMobile = useIsMobile();

  const [slots, setSlots] = useState<(SlotEntry | null)[]>(() =>
    Array.from({ length: VISIBLE_SLOTS }, () => null),
  );
  const [backlog, setBacklog] = useState<SlotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState(false);

  // Refs so async callbacks always read the latest values without stale closures.
  const decidedRef = useRef<Set<number>>(
    new Set(useStore.getState().pool.map((e) => e.game.igdbId)),
  );
  const rejectedRef = useRef<Set<number>>(new Set());
  const slotsRef = useRef<(SlotEntry | null)[]>(slots);
  const backlogRef = useRef<SlotEntry[]>([]);
  const fetchingRef = useRef(false);
  const exhaustedRef = useRef(false);
  const initRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Preset-shelf handoff: count how many preset batches we've fetched and how many games the
  // user has accepted. Stop requesting preset once either threshold is reached.
  const presetBatchesRef = useRef(0);
  const acceptsRef = useRef(0);

  /** True while the curated starter shelf should still be requested. */
  const shouldUsePreset = useCallback(
    () => presetBatchesRef.current < PRESET_BATCH_LIMIT && acceptsRef.current < PRESET_ACCEPT_HANDOFF,
    [],
  );

  // Keep refs in step with state.
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  useEffect(() => {
    backlogRef.current = backlog;
  }, [backlog]);

  /** Every id we're holding (decided, visible, or queued) — the canonical exclude set. */
  const buildExclude = useCallback((): number[] => {
    const ids = new Set(decidedRef.current);
    for (const s of slotsRef.current) if (s) ids.add(s.game.igdbId);
    for (const b of backlogRef.current) ids.add(b.game.igdbId);
    return [...ids];
  }, []);

  const buildSuggestionContext = useCallback(
    () => ({
      seedIds: useStore.getState().pool.map((e) => e.game.igdbId),
      rejectIds: [...rejectedRef.current],
    }),
    [],
  );

  const filterFreshGames = useCallback(
    (games: Game[]): Game[] => {
      const held = new Set(buildExclude());
      const seen = new Set<number>();
      return games.filter((game) => {
        if (held.has(game.igdbId) || seen.has(game.igdbId)) return false;
        seen.add(game.igdbId);
        return true;
      });
    },
    [buildExclude],
  );

  /** Move entries from the backlog into any null slots. Idempotent. */
  const fillEmptySlots = useCallback(() => {
    const currentSlots = slotsRef.current;
    const currentBacklog = backlogRef.current;

    let changed = false;
    let queue = [...currentBacklog];
    const nextSlots = currentSlots.map((s) => {
      if (s !== null || queue.length === 0) return s;
      changed = true;
      const [head, ...rest] = queue;
      queue = rest;
      return head ?? null;
    });

    if (!changed) return;

    backlogRef.current = queue;
    slotsRef.current = nextSlots;
    setBacklog(queue);
    setSlots(nextSlots);
  }, []);

  /**
   * Fetch a batch from the API and append to the backlog. Skips if already fetching,
   * the shelf is exhausted, or the backlog is comfortably full (`REFILL_AT`).
   */
  const ensureBacklog = useCallback(async () => {
    if (fetchingRef.current || exhaustedRef.current) return;
    if (backlogRef.current.length >= REFILL_AT) return;
    fetchingRef.current = true;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setError(false);
    setLoading(true);

    try {
      const preset = shouldUsePreset();
      const games = await fetchSuggestions(
        { prefs, exclude: buildExclude(), ...buildSuggestionContext(), preset, limit: VISIBLE_SLOTS },
        fetchImpl ?? fetch,
      );

      const freshGames = filterFreshGames(games);

      if (freshGames.length === 0) {
        exhaustedRef.current = true;
        setExhausted(true);
        return;
      }

      if (preset) presetBatchesRef.current += 1;

      const entries: SlotEntry[] = freshGames.map((g) => ({
        game: g,
      }));

      const next = [...backlogRef.current, ...entries];
      backlogRef.current = next;
      setBacklog(next);

      fillEmptySlots();
    } catch {
      setError(true);
      retryTimerRef.current = setTimeout(() => void ensureBacklog(), 1500);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [prefs, fetchImpl, buildExclude, buildSuggestionContext, filterFreshGames, fillEmptySlots, shouldUsePreset]);

  // Bootstrap: load the first batch straight into the five slots, then top up the backlog.
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const bootstrap = async () => {
      fetchingRef.current = true;
      setError(false);
      setLoading(true);

      try {
        const preset = shouldUsePreset();
        const ctx = buildSuggestionContext();
        // On a fresh preset-shelf open, reuse the batch prefetched on the welcome screen so the
        // pool builder paints instantly. Only when nothing's decided yet and no fetch stub is
        // injected (tests drive the network themselves); otherwise fetch normally.
        const canUsePrefetch =
          preset &&
          !fetchImpl &&
          decidedRef.current.size === 0 &&
          ctx.seedIds.length === 0 &&
          ctx.rejectIds.length === 0;
        const prefetched = canUsePrefetch ? await peekStarterBatch() : null;
        const games =
          prefetched && prefetched.length > 0
            ? prefetched
            : await fetchSuggestions(
                {
                  prefs,
                  exclude: [...decidedRef.current],
                  ...ctx,
                  preset,
                  limit: VISIBLE_SLOTS,
                },
                fetchImpl ?? fetch,
              );

        const freshGames = filterFreshGames(games);

        if (freshGames.length === 0) {
          exhaustedRef.current = true;
          setExhausted(true);
          setLoading(false);
          fetchingRef.current = false;
          return;
        }

        if (preset) presetBatchesRef.current += 1;

        const entries: (SlotEntry | null)[] = freshGames.slice(0, VISIBLE_SLOTS).map((g) => ({
          game: g,
        }));

        while (entries.length < VISIBLE_SLOTS) entries.push(null);

        slotsRef.current = entries;
        setSlots(entries);
        setLoading(false);
        fetchingRef.current = false;

        void ensureBacklog();
      } catch {
        setError(true);
        setLoading(false);
        fetchingRef.current = false;
        retryTimerRef.current = setTimeout(() => void bootstrap(), 1500);
      }
    };

    void bootstrap();

    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Record the decision for prefetch/handoff bookkeeping. Shared by both layouts. */
  const recordDecision = (id: number, action: PoolDecision) => {
    decidedRef.current.add(id);
    if (action === 'reject') rejectedRef.current.add(id);
    if (action === 'include') acceptsRef.current += 1;
  };

  /**
   * Desktop grid: replace the decided card *in place* with a backlog card so the other four slots
   * never reflow.
   */
  const handleDecide = (id: number, action: PoolDecision) => {
    if (decidedRef.current.has(id)) return;
    const idx = slotsRef.current.findIndex((s) => s?.game.igdbId === id);
    if (idx === -1) return;

    recordDecision(id, action);

    // Pop one from the backlog (mutate ref + batch state) so ensureBacklog below
    // reads the latest count and refills proactively.
    const [replacement, ...rest] = backlogRef.current;
    const nextSlots = [...slotsRef.current];
    nextSlots[idx] = replacement ?? null;
    slotsRef.current = nextSlots;
    backlogRef.current = rest;
    setBacklog(rest);
    setSlots(nextSlots);

    void ensureBacklog();
  };

  /**
   * Mobile swipe deck: treat the slots as a FIFO queue. Deciding the front card drops it, shifts
   * the rest forward (so the card that was peeking becomes the next active one), and appends a
   * fresh backlog card to the tail — nothing gets skipped.
   */
  const handleSwipeDecide = (id: number, action: PoolDecision) => {
    if (decidedRef.current.has(id)) return;
    if (!slotsRef.current.some((s) => s?.game.igdbId === id)) return;

    recordDecision(id, action);

    const kept = slotsRef.current.filter(
      (s): s is SlotEntry => s !== null && s.game.igdbId !== id,
    );
    const [replacement, ...rest] = backlogRef.current;
    const nextSlots: (SlotEntry | null)[] = [...kept];
    if (replacement) nextSlots.push(replacement);
    while (nextSlots.length < VISIBLE_SLOTS) nextSlots.push(null);

    slotsRef.current = nextSlots;
    backlogRef.current = rest;
    setBacklog(rest);
    setSlots(nextSlots);

    void ensureBacklog();
  };

  const showSkeletons = loading && slots.every((s) => s === null);
  const showError = error && slots.every((s) => s === null);
  const showExhausted = exhausted && slots.every((s) => s === null) && backlog.length === 0;

  return (
    <StepScaffold
      compact
      eyebrow="Step 3 · Your games"
      title="Add the games you've played."
      description="Wave through suggestions or search for anything — aim for 20+ games you've actually played."
      nextLabel="Enter the arcade →"
      nextDisabled={poolCount < MIN_POOL}
      headerAside={<RosterMeter compact count={poolCount} />}
    >
      <div className="flex flex-1 flex-col gap-4">
        <ManualSearch fetchImpl={fetchImpl} />

        <div className="flex min-h-[18rem] flex-1 flex-col justify-center">
          {isMobile ? (
            <PoolSwipeDeck
              slots={slots}
              error={error}
              exhausted={exhausted && backlog.length === 0}
              onDecide={handleSwipeDecide}
              onRetry={() => void ensureBacklog()}
              random={random}
            />
          ) : showSkeletons ? (
            <div className="mx-auto grid w-fit grid-cols-3 gap-6 lg:gap-8">
              {Array.from({ length: VISIBLE_SLOTS }).map((_, i) => (
                <div
                  key={i}
                  className="relative mx-auto w-[var(--cover-pool)] overflow-hidden rounded-card border-2 border-border bg-surface shadow-cabinet"
                >
                  <GameCard loading size="pool" className="w-full rounded-none" />
                  <div className="grid grid-cols-2 gap-2.5 border-t-2 border-black/50 bg-panel px-3 py-3">
                    <div className="h-10 rounded-control border-2 border-border bg-surface-elevated" />
                    <div className="h-10 rounded-control border-2 border-teal/40 bg-teal/10" />
                  </div>
                </div>
              ))}
            </div>
          ) : showError ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-card border border-dashed border-coin/50 bg-surface/40 p-10 text-center">
              <p className="font-display text-lg font-bold uppercase tracking-[0.04em] text-fg">
                Couldn&rsquo;t load suggestions
              </p>
              <p className="max-w-sm text-sm text-muted">
                The game library didn&rsquo;t respond — this can happen on the first load. Retrying
                automatically…
              </p>
              <Button variant="secondary" onClick={() => void ensureBacklog()}>
                Retry now
              </Button>
            </div>
          ) : showExhausted ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-border bg-surface/40 p-10 text-center">
              <p className="font-display text-lg font-bold uppercase tracking-[0.04em] text-fg">
                That&rsquo;s our whole shelf for now
              </p>
              <p className="max-w-sm text-sm text-muted">
                You&rsquo;ve reviewed every suggestion that fits. Use search above to add any game
                by name, then enter the arcade.
              </p>
            </div>
          ) : (
            <div className="mx-auto grid w-fit grid-cols-3 gap-6 lg:gap-8">
              {slots.map((entry, i) => (
                <div
                  key={i}
                  className="relative flex w-[var(--cover-pool)] justify-center"
                  style={{ minHeight: 'calc(var(--cover-pool) * 4 / 3 + 4rem)' }}
                >
                  <AnimatePresence mode="wait">
                    {entry ? (
                      <PoolCard
                        key={entry.game.igdbId}
                        game={entry.game}
                        random={random}
                        onDecide={(action) => handleDecide(entry.game.igdbId, action)}
                      />
                    ) : (
                      <motion.div
                        key={`placeholder-${i}`}
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0 }}
                        className="mx-auto flex w-[var(--cover-pool)] items-center justify-center self-stretch rounded-card border-2 border-dashed border-border bg-surface/30 p-4"
                      >
                        {loading ? (
                          <GameCard loading size="pool" className="w-full" />
                        ) : (
                          <p className="py-8 text-center text-xs text-muted">No more suggestions</p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </StepScaffold>
  );
}
