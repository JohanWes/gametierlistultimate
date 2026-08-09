'use client';

import { useEffect } from 'react';

import { prefetchAdaptiveBatch, prefetchStarterBatch } from '@/lib/games/prefetch';
import { loadLocalSession } from '@/lib/session-local';
import { startAutosave, useStore } from '@/lib/store';

import { VISIBLE_SLOTS } from './steps/PoolStep';

// Bound the resume prefetch the same way PoolStep bounds its live API calls, so request cost stays
// flat regardless of how many games have been rejected across sessions.
const RESUME_REJECT_IDS = 80;
const RESUME_EXCLUDE = 300;

/**
 * Side-effect-only component: restores in-progress state from localStorage (no network),
 * starts debounced autosave, and kicks off the first pool-step batch prefetch (cold starter
 * shelf or adaptive for a returning user) so the pool builder opens with no perceptible
 * loading — see lib/games/prefetch.ts. Renders nothing.
 *
 * Mounted on the home page only, so shared pages never touch the user's session, autosave,
 * or prefetch. Mute/audio live in the root layout's SoundHydrator.
 */
export function StoreHydrator() {
  useEffect(() => {
    // Resume saved in-progress state straight from localStorage — fully local, zero round-trips.
    const saved = loadLocalSession();
    if (saved) {
      useStore.getState().hydrate(saved);
    } else {
      useStore.getState().setHydrated(true);
    }

    // Warm the first pool-step batch so the pool builder opens instantly. A cold pool (no
    // accepted games) gets the curated starter shelf; a warm/returning pool gets an adaptive
    // batch seeded by the already-accepted games so it doesn't pay for a live adaptive
    // round-trip on first paint. Skipped when the user resumes past the pool step
    // (arcade/reveal) — no pool batch needed.
    const { pool, rejected, ui } = useStore.getState();
    const resumeStep = ui.step;
    if (resumeStep === 'welcome' || resumeStep === 'pool') {
      if (pool.length === 0) {
        prefetchStarterBatch(VISIBLE_SLOTS);
      } else {
        const seedIds = pool.map((e) => e.game.igdbId);
        // Bounded recent slice mirrors PoolStep's API caps (full reject set is enforced locally).
        const rejectIds = rejected.slice(-RESUME_REJECT_IDS);
        prefetchAdaptiveBatch({
          seedIds,
          rejectIds,
          exclude: [...seedIds, ...rejectIds].slice(-RESUME_EXCLUDE),
          limit: VISIBLE_SLOTS,
        });
      }
    }

    const stopAutosave = startAutosave();

    return () => {
      stopAutosave();
    };
  }, []);

  return null;
}
