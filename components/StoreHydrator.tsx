'use client';

import { useEffect } from 'react';

import { fetchGamesByIds } from '@/lib/games/client';
import { initAudio, setMuted } from '@/lib/sound';
import { startAutosave, useStore } from '@/lib/store';

/**
 * Side-effect-only component: ensures an anonymous session exists, hydrates the store from it,
 * restores the mute preference, starts debounced autosave, syncs mute into the sound module,
 * and lazily initializes Web Audio on the first user gesture. Renders nothing.
 */
export function StoreHydrator() {
  useEffect(() => {
    let cancelled = false;

    // Ensure a session cookie, then load any saved in-progress state.
    void (async () => {
      try {
        await fetch('/api/session', { method: 'POST', credentials: 'same-origin' });
        const res = await fetch('/api/session', { credentials: 'same-origin' });
        const data = (await res.json()) as { session?: unknown };
        if (cancelled) return;
        if (data?.session && typeof data.session === 'object') {
          const session = data.session as Record<string, unknown>;
          const poolIds = Array.isArray(session.pool)
            ? session.pool.filter((n): n is number => typeof n === 'number')
            : [];
          const poolGames = poolIds.length ? await fetchGamesByIds(poolIds) : [];
          if (cancelled) return;
          useStore.getState().hydrate({ ...session, poolGames });
        } else {
          useStore.getState().setHydrated(true);
        }
      } catch {
        if (!cancelled) useStore.getState().setHydrated(true);
      }
    })();

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
      cancelled = true;
      unsubSound();
      removeGestureListeners();
      stopAutosave();
    };
  }, []);

  return null;
}
