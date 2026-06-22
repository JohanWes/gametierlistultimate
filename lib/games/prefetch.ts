import { fetchSuggestions } from './client';
import type { Game, Preferences } from './types';

/**
 * Warm the first pool-step batch before the user reaches Step 3, so the pool builder opens with
 * no perceptible loading. Two flavors:
 *
 *  - **Starter** (cold pool, no accepted games): the curated starter shelf is fixed and
 *    prediction-independent, so it can be fetched as early as the welcome/hydration moment.
 *  - **Adaptive** (warm/returning pool): a batch seeded by the already-accepted games, so a
 *    returning user with 20+ games also gets an instant first paint instead of a live
 *    adaptive round-trip.
 *
 * Both flavors prime the server's in-process caches, warm the browser HTTP cache for the
 * batch's cover art, and pin the decoded cover bitmaps so they survive step transitions.
 *
 * Fire-and-forget and best-effort: a failure clears the cache so PoolStep's own fetch retries.
 */
let starterBatchPromise: Promise<Game[]> | null = null;
let adaptiveBatchPromise: Promise<Game[]> | null = null;

/**
 * Pinned `Image` elements holding decoded cover bitmaps. Keeping them alive prevents the
 * browser from GC-ing the decoded bitmaps between step transitions, so re-showing a
 * keep-alive PoolStep paints instantly instead of re-decoding.
 */
const decodedCovers: Set<HTMLImageElement> = new Set();

/** Kick off the starter-shelf prefetch if it hasn't started yet. Safe to call repeatedly. */
export function prefetchStarterBatch(limit: number, fetchImpl: typeof fetch = fetch): void {
  if (starterBatchPromise) return;
  starterBatchPromise = fetchSuggestions({ preset: true, limit }, fetchImpl)
    .then((games) => {
      preloadCovers(games);
      return games;
    })
    .catch(() => {
      starterBatchPromise = null; // allow a later retry (e.g. PoolStep's bootstrap)
      return [];
    });
}

/** The in-flight/resolved starter-shelf prefetch, or null if none was started. */
export function peekStarterBatch(): Promise<Game[]> | null {
  return starterBatchPromise;
}

export interface AdaptiveBatchQuery {
  seedIds: number[];
  rejectIds: number[];
  exclude: number[];
  prefs: Preferences;
  limit: number;
}

/**
 * Kick off an adaptive-batch prefetch (warm/returning pool) if it hasn't started yet.
 * Safe to call repeatedly. The batch is seeded by the user's accepted games and excludes
 * already-decided ids, mirroring what PoolStep's bootstrap would fetch — so the first
 * step-3 paint reuses this instead of doing a live adaptive round-trip.
 */
export function prefetchAdaptiveBatch(
  query: AdaptiveBatchQuery,
  fetchImpl: typeof fetch = fetch,
): void {
  if (adaptiveBatchPromise) return;
  adaptiveBatchPromise = fetchSuggestions(
    {
      seedIds: query.seedIds,
      rejectIds: query.rejectIds,
      exclude: query.exclude,
      prefs: query.prefs,
      limit: query.limit,
    },
    fetchImpl,
  )
    .then((games) => {
      preloadCovers(games);
      return games;
    })
    .catch(() => {
      adaptiveBatchPromise = null;
      return [];
    });
}

/** The in-flight/resolved adaptive-batch prefetch, or null if none was started. */
export function peekAdaptiveBatch(): Promise<Game[]> | null {
  return adaptiveBatchPromise;
}

/** Test/reset hook — drops all cached prefetches and pinned covers so the next call starts fresh. */
export function resetStarterBatchPrefetch(): void {
  starterBatchPromise = null;
  adaptiveBatchPromise = null;
  decodedCovers.clear();
}

/** Drop pinned decoded covers without clearing the batch promises. */
export function resetDecodedCovers(): void {
  decodedCovers.clear();
}

/**
 * Warm the browser image cache for a batch's covers and pin the decoded bitmaps so they
 * survive step transitions. In jsdom (tests) `Image` exists but `decode()` may not, so the
 * decode call is guarded. Exported so the pool builder can warm backlog covers ahead of
 * display (not just the initial prefetched batch).
 */
export function preloadCovers(games: Game[]): void {
  if (typeof window === 'undefined') return;
  for (const game of games) {
    if (!game.coverUrl) continue;
    const img = new window.Image();
    img.decoding = 'async';
    img.src = game.coverUrl;
    decodedCovers.add(img);
    if (typeof img.decode === 'function') {
      img.decode().catch(() => {
        /* best-effort: a failed decode just means the <img> will decode on paint */
      });
    }
  }
}
