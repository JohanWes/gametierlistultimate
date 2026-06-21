import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Game } from '@/lib/games/types';
import { LOCAL_SESSION_KEY } from '@/lib/session-local';

import { resetStore, startAutosave, useStore, type PoolEntry } from './index';

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

function poolEntries(count: number): PoolEntry[] {
  return Array.from({ length: count }, (_, i) => ({ game: makeGame(i + 1), status: 'finished' }));
}

function readLocalSession() {
  const raw = window.localStorage.getItem(LOCAL_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
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
    beforeEach(() => {
      vi.useFakeTimers();
      window.localStorage.clear();
    });
    afterEach(() => vi.useRealTimers());

    it('debounces a localStorage write after persisted state changes (no network)', () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
      const stop = startAutosave({ waitMs: 500, fetchImpl });

      useStore.getState().setHydrated(true); // ui-only change must NOT trigger a save
      useStore.getState().toggleGenre('RPG');
      useStore.getState().toggleGenre('Action'); // rapid changes collapse into one write

      expect(readLocalSession()).toBeNull(); // still within debounce window
      vi.advanceTimersByTime(500);

      expect(readLocalSession().prefs.genres).toEqual(['RPG', 'Action']);
      expect(fetchImpl).not.toHaveBeenCalled(); // a pref change is local-only
      stop();
    });

    it('posts a pool delta to /api/pool-stats when the pool ids change', () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
      const stop = startAutosave({ waitMs: 500, fetchImpl });

      useStore.getState().setHydrated(true);
      useStore.getState().addToPool(makeGame(1));
      useStore.getState().addToPool(makeGame(2));
      vi.advanceTimersByTime(500);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe('/api/pool-stats');
      expect(init).toMatchObject({ method: 'POST' });
      expect(JSON.parse(init.body)).toEqual({ previous: [], next: [1, 2] });
      // The pool is also persisted locally.
      expect(readLocalSession().pool.map((e: PoolEntry) => e.game.igdbId)).toEqual([1, 2]);
      stop();
    });

    it('persists the current step after hydration', () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
      const stop = startAutosave({ waitMs: 500, fetchImpl });

      useStore.getState().setHydrated(true);
      useStore.getState().goNext();
      vi.advanceTimersByTime(500);

      expect(readLocalSession().step).toBe('onboarding');
      stop();
    });

    it('does not persist the hydration patch itself', () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
      const stop = startAutosave({ waitMs: 500, fetchImpl });

      useStore.getState().hydrate({ prefs: { genres: ['RPG'] }, step: 'pool' });
      vi.advanceTimersByTime(500);

      expect(readLocalSession()).toBeNull();
      expect(fetchImpl).not.toHaveBeenCalled();
      stop();
    });

    it('does not persist before hydration', () => {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
      const stop = startAutosave({ waitMs: 500, fetchImpl });

      useStore.getState().toggleGenre('RPG'); // hydrated is still false
      vi.advanceTimersByTime(500);

      expect(readLocalSession()).toBeNull();
      stop();
    });
  });

  describe('hydration', () => {
    it('restores a saved step when it is valid', () => {
      useStore.getState().hydrate({ step: 'pool' });
      expect(useStore.getState().ui.step).toBe('pool');
    });

    it('ignores an invalid saved step', () => {
      useStore.getState().hydrate({ step: 'bogus' });
      expect(useStore.getState().ui.step).toBe('welcome');
    });

    it('falls advanced steps back to pool when the restored pool is too small', () => {
      useStore.getState().hydrate({ pool: poolEntries(3), step: 'arcade' });
      expect(useStore.getState().ui.step).toBe('pool');
    });

    it('resumes an advanced step and restores pool entries with their statuses', () => {
      const pool = poolEntries(12).map((e) => ({ ...e, status: 'played-a-lot' as const }));
      useStore.getState().hydrate({ pool, step: 'arcade' });

      expect(useStore.getState().ui.step).toBe('arcade');
      expect(useStore.getState().pool).toHaveLength(12);
      expect(useStore.getState().pool.every((e) => e.status === 'played-a-lot')).toBe(true);
    });
  });
});
