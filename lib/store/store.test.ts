import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Game } from '@/lib/games/types';

import { resetStore, startAutosave, useStore } from './index';

function makeGame(igdbId: number): Game {
  return {
    igdbId,
    title: `Game ${igdbId}`,
    coverUrl: null,
    genres: [],
    platforms: [],
    releaseYear: null,
    popularity: null,
    rating: null,
    summary: null,
    hasCover: false,
    category: null,
  };
}

describe('store', () => {
  beforeEach(() => resetStore());

  describe('flow machine', () => {
    it('starts at welcome and steps forward/back', () => {
      const s = useStore.getState();
      expect(s.ui.step).toBe('welcome');
      s.goNext();
      expect(useStore.getState().ui.step).toBe('onboarding');
      useStore.getState().goNext();
      expect(useStore.getState().ui.step).toBe('pool');
      useStore.getState().goBack();
      expect(useStore.getState().ui.step).toBe('onboarding');
    });

    it('clamps at the ends and supports setStep', () => {
      useStore.getState().goBack();
      expect(useStore.getState().ui.step).toBe('welcome'); // can't go before the first
      useStore.getState().setStep('reveal');
      useStore.getState().goNext();
      expect(useStore.getState().ui.step).toBe('reveal'); // can't go past the last
    });
  });

  describe('pool', () => {
    it('adds and removes games and de-dupes', () => {
      const { addToPool } = useStore.getState();
      addToPool(makeGame(1));
      addToPool(makeGame(2));
      addToPool(makeGame(1)); // duplicate ignored
      expect(useStore.getState().pool).toHaveLength(2);
      useStore.getState().removeFromPool(1);
      expect(useStore.getState().pool.map((e) => e.game.igdbId)).toEqual([2]);
    });
  });

  describe('sound', () => {
    it('toggles soundOn', () => {
      expect(useStore.getState().ui.soundOn).toBe(true);
      useStore.getState().toggleSound();
      expect(useStore.getState().ui.soundOn).toBe(false);
    });
  });

  describe('autosave', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('debounces a PUT /api/session after persisted state changes', () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
      const stop = startAutosave({ waitMs: 500, fetchImpl });

      useStore.getState().setHydrated(true); // ui-only change must NOT trigger a save
      useStore.getState().toggleGenre('RPG');
      useStore.getState().toggleGenre('Action'); // rapid changes collapse into one PUT

      expect(fetchImpl).not.toHaveBeenCalled(); // still within debounce window
      vi.advanceTimersByTime(500);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('/api/session');
      expect(init).toMatchObject({ method: 'PUT' });
      expect(JSON.parse(init.body).prefs.genres).toEqual(['RPG', 'Action']);

      stop();
    });

    it('does not autosave before hydration', () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
      const stop = startAutosave({ waitMs: 500, fetchImpl });

      useStore.getState().toggleGenre('RPG'); // hydrated is still false
      vi.advanceTimersByTime(500);

      expect(fetchImpl).not.toHaveBeenCalled();
      stop();
    });
  });
});
