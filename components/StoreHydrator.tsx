'use client';

import { useEffect } from 'react';

import { prefetchAdaptiveBatch, prefetchStarterBatch } from '@/lib/games/prefetch';
import { loadLocalSession } from '@/lib/session-local';
import { initAudio, setMuted } from '@/lib/sound';
import { startAutosave, useStore } from '@/lib/store';

import { VISIBLE_SLOTS } from './steps/PoolStep';

/**
 * Side-effect-only component: restores in-progress state from localStorage (no network),
 * restores the mute preference, starts debounced autosave, syncs mute into the sound module,
 * and lazily initializes Web Audio on the first user gesture. Renders nothing.
 *
 * Also kicks off the first pool-step batch prefetch (cold starter shelf or adaptive for a
 * returning user) so Step 3 opens with no perceptible loading — see lib/games/prefetch.ts.
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

    // Warm the first pool-step batch so Step 3 opens instantly. A cold pool (no accepted games)
    // gets the curated starter shelf; a warm/returning pool gets an adaptive batch seeded by the
    // already-accepted games so it doesn't pay for a live adaptive round-trip on first paint.
    // Skipped when the user resumes past the pool step (arcade/reveal) — no pool batch needed.
    const { pool, prefs, ui } = useStore.getState();
    const resumeStep = ui.step;
    if (resumeStep === 'welcome' || resumeStep === 'onboarding' || resumeStep === 'pool') {
      if (pool.length === 0) {
        prefetchStarterBatch(VISIBLE_SLOTS);
      } else {
        const seedIds = pool.map((e) => e.game.igdbId);
        prefetchAdaptiveBatch({
          seedIds,
          rejectIds: [],
          exclude: seedIds,
          prefs,
          limit: VISIBLE_SLOTS,
        });
      }
    }

    // Restore the persisted mute preference (defaults to on).
    try {
      if (window.localStorage.getItem('gtl_sound') === 'off') {
        useStore.getState().setSoundOn(false);
      }
    } catch {
      /* storage unavailable */
    }

    // Keep the sound module's mute flag in sync with the store.
    setMuted(!useStore.getState().ui.soundOn);
    const unsubSound = useStore.subscribe((s) => setMuted(!s.ui.soundOn));

    // Web Audio can only start after a user gesture — initialize once, then forget.
    const onFirstGesture = () => {
      initAudio();
      removeGestureListeners();
    };
    const removeGestureListeners = () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
      window.removeEventListener('touchstart', onFirstGesture);
    };
    window.addEventListener('pointerdown', onFirstGesture);
    window.addEventListener('keydown', onFirstGesture);
    window.addEventListener('touchstart', onFirstGesture);

    const stopAutosave = startAutosave();

    return () => {
      unsubSound();
      removeGestureListeners();
      stopAutosave();
    };
  }, []);

  return null;
}
