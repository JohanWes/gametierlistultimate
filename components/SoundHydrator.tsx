'use client';

import { useEffect } from 'react';

import { initAudio, setMuted } from '@/lib/sound';
import { useStore } from '@/lib/store';

/**
 * Side-effect-only component: restores the persisted mute preference, keeps the sound
 * module's mute flag in sync with the store, and lazily initializes Web Audio on the first
 * user gesture. Renders nothing.
 *
 * Mounted in the root layout so shared (read-only) pages still honor mute and audio, while
 * session hydration/autosave/prefetch stay scoped to the home page (see StoreHydrator).
 */
export function SoundHydrator() {
  useEffect(() => {
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

    return () => {
      unsubSound();
      removeGestureListeners();
    };
  }, []);

  return null;
}
