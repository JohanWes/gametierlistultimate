import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Game } from '@/lib/games/types';
import { createRankingState } from '@/lib/ranking';
import { LOCAL_SESSION_KEY, type LocalSessionState } from '@/lib/session-local';
import { mockFetch } from '@/test/helpers/fetch';

import { resetStore, startAutosave, useStore, type PoolEntry } from './index';

function makeGame(igdbId: number): Game {
  return {
    igdbId,
    title: `Game ${igdbId}`,
    coverUrl: null,
    genres: [],
    releaseYear: null,
    popularity: null,
    rating: null,
    category: null,
  };
}

function poolEntries(count: number): PoolEntry[] {
  return Array.from({ length: count }, (_, i) => ({ game: makeGame(i + 1), status: 'finished' }));
}

function saved(patch: Partial<LocalSessionState>): LocalSessionState {
  return { pool: [], rejected: [], scores: null, step: 'welcome', ...patch };
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
      expect(useStore.getState().ui.step).toBe('pool');
      useStore.getState().goNext();
      expect(useStore.getState().ui.step).toBe('arcade');
      useStore.getState().goBack();
      expect(useStore.getState().ui.step).toBe('pool');
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

  describe('rejected', () => {
    it('records rejected ids and de-dupes', () => {
      const { markRejected } = useStore.getState();
      markRejected(1);
      markRejected(2);
      markRejected(1); // duplicate ignored
      expect(useStore.getState().rejected).toEqual([1, 2]);
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
      const fetchMock = mockFetch();
      const stop = startAutosave();

      useStore.getState().setHydrated(true); // ui-only change must NOT trigger a save
      useStore.getState().setScores(createRankingState([1]));
      useStore.getState().setScores(createRankingState([2])); // collapses into one write

      expect(readLocalSession()).toBeNull(); // still within debounce window
      vi.advanceTimersByTime(600);

      expect(readLocalSession().scores).toEqual(createRankingState([2]));
      expect(fetchMock).not.toHaveBeenCalled(); // a local state change is local-only
      stop();
    });

    it('posts a pool delta to /api/pool-stats when the pool ids change', () => {
      const fetchMock = mockFetch();
      const stop = startAutosave();

      useStore.getState().setHydrated(true);
      useStore.getState().addToPool(makeGame(1));
      useStore.getState().addToPool(makeGame(2));
      vi.advanceTimersByTime(600);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/pool-stats');
      expect(init).toMatchObject({ method: 'POST' });
      expect(JSON.parse(init?.body as string)).toEqual({ previous: [], next: [1, 2] });
      // The pool is also persisted locally.
      expect(readLocalSession().pool.map((e: PoolEntry) => e.game.igdbId)).toEqual([1, 2]);
      stop();
    });

    it('persists rejected ids locally (no network) after a rejection', () => {
      const fetchMock = mockFetch();
      const stop = startAutosave();

      useStore.getState().setHydrated(true);
      useStore.getState().markRejected(7);
      useStore.getState().markRejected(8);
      vi.advanceTimersByTime(600);

      expect(readLocalSession().rejected).toEqual([7, 8]);
      expect(fetchMock).not.toHaveBeenCalled(); // rejections are local-only
      stop();
    });

    it('persists the current step after hydration', () => {
      const stop = startAutosave();

      useStore.getState().setHydrated(true);
      useStore.getState().goNext();
      vi.advanceTimersByTime(600);

      expect(readLocalSession().step).toBe('pool');
      stop();
    });

    it('does not persist before hydration', () => {
      const stop = startAutosave();

      useStore.getState().setScores(createRankingState([1])); // hydrated is still false
      vi.advanceTimersByTime(600);

      expect(readLocalSession()).toBeNull();
      stop();
    });

    it('does not resurrect a cleared session when Start over unhydrates before pagehide', () => {
      const stop = startAutosave();

      // A debounced save still inside its window when Start over unhydrates + clears; neither
      // it nor the pagehide flush may write the in-memory state back.
      useStore.getState().setHydrated(true);
      useStore.getState().setScores(createRankingState([1]));
      useStore.getState().setHydrated(false);

      vi.advanceTimersByTime(600); // deadline elapses before pagehide
      expect(readLocalSession()).toBeNull();

      window.dispatchEvent(new Event('pagehide'));
      expect(readLocalSession()).toBeNull();
      stop();
    });

    it('flushes current state synchronously on pagehide after hydration', () => {
      const stop = startAutosave();

      useStore.getState().setHydrated(true);
      useStore.getState().setScores(createRankingState([1])); // inside the debounce window

      expect(readLocalSession()).toBeNull();
      window.dispatchEvent(new Event('pagehide'));

      // Written immediately, not after the debounce window.
      expect(readLocalSession().scores).toEqual(createRankingState([1]));
      vi.advanceTimersByTime(600);
      stop();
    });
  });

  describe('hydration', () => {
    it('restores a saved step when it is valid', () => {
      useStore.getState().hydrate(saved({ step: 'pool' }));
      expect(useStore.getState().ui.step).toBe('pool');
    });

    it('ignores an invalid saved step', () => {
      useStore.getState().hydrate(saved({ step: 'bogus' as LocalSessionState['step'] }));
      expect(useStore.getState().ui.step).toBe('welcome');
    });

    it('falls advanced steps back to pool when the restored pool is too small', () => {
      useStore.getState().hydrate(saved({ pool: poolEntries(1), step: 'arcade' }));
      expect(useStore.getState().ui.step).toBe('pool');
    });

    it('resumes an advanced step and restores pool entries with their statuses', () => {
      const pool = poolEntries(12).map((e) => ({ ...e, status: 'played-a-lot' as const }));
      useStore.getState().hydrate(saved({ pool, step: 'arcade' }));

      expect(useStore.getState().ui.step).toBe('arcade');
      expect(useStore.getState().pool).toHaveLength(12);
      expect(useStore.getState().pool.every((e) => e.status === 'played-a-lot')).toBe(true);
    });
  });
});
