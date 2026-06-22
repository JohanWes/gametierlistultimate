import { fetchSuggestions } from './client';
import type { Game } from './types';

/**
 * Warm the deterministic curated starter shelf before the user reaches Step 3.
 *
 * The first preset batch is fixed (prediction-independent — it doesn't depend on anything the user
 * has picked), so we can fetch it as early as the welcome screen. This does three things by the
 * time the user presses "start":
 *   1. primes the server's in-process starter cache (`getStarterSet` memo),
 *   2. warms the browser cache for the first batch's (local) cover art, and
 *   3. lets PoolStep's bootstrap reuse the already-resolved batch instead of fetching again.
 *
 * Fire-and-forget and best-effort: a failure clears the cache so PoolStep's own fetch retries.
 */
let starterBatchPromise: Promise<Game[]> | null = null;

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

/** Test/reset hook — drops the cached prefetch so the next call starts fresh. */
export function resetStarterBatchPrefetch(): void {
  starterBatchPromise = null;
}

/** Warm the browser image cache for a batch's covers so they paint instantly at Step 3. */
function preloadCovers(games: Game[]): void {
  if (typeof window === 'undefined') return;
  for (const game of games) {
    if (!game.coverUrl) continue;
    const img = new window.Image();
    img.decoding = 'async';
    img.src = game.coverUrl;
  }
}
