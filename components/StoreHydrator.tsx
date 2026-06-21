'use client';

import { useEffect } from 'react';

import { loadLocalSession } from '@/lib/session-local';
import { initAudio, setMuted } from '@/lib/sound';
import { startAutosave, useStore } from '@/lib/store';

/**
 * Side-effect-only component: restores in-progress state from localStorage (no network),
 * restores the mute preference, starts debounced autosave, syncs mute into the sound module,
 * and lazily initializes Web Audio on the first user gesture. Renders nothing.
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
