'use client';

import { create } from 'zustand';

import { resolveResumeStep, STEP_ORDER, type Step } from '@/lib/flow';
import type { Game } from '@/lib/games/types';
import type { RankingState } from '@/lib/ranking';
import { saveLocalSession, type LocalSessionState } from '@/lib/session-local';
import { debounce } from '@/lib/utils';

export { MIN_POOL, STEP_ORDER, type Step } from '@/lib/flow';

/* ------------------------------------------------------------------ slice shapes */

export type PlayedStatus = 'tried' | 'finished' | 'played-a-lot';

export interface PoolEntry {
  game: Game;
  status: PlayedStatus;
}

export interface UiState {
  soundOn: boolean;
  step: Step;
  hydrated: boolean;
}

/* ------------------------------------------------------------------ store */

export interface StoreState {
  /** Games the user has added, with played status. Live UI source of truth. */
  pool: PoolEntry[];
  /**
   * Every game id the user has passed on (rejected) in the pool picker. Persisted in full so
   * resume never re-shows them; only a recent slice is sent to the server (see PoolStep).
   */
  rejected: number[];
  /** Hidden ranking engine state; null until the arcade first builds it. */
  scores: RankingState | null;
  ui: UiState;

  // pool actions
  addToPool: (game: Game, status?: PlayedStatus) => void;
  removeFromPool: (igdbId: number) => void;
  markRejected: (igdbId: number) => void;

  // scores
  setScores: (scores: RankingState) => void;

  // flow + ui
  setStep: (step: Step) => void;
  goNext: () => void;
  goBack: () => void;
  toggleSound: () => void;
  setSoundOn: (on: boolean) => void;
  setHydrated: (hydrated: boolean) => void;

  // persistence
  hydrate: (saved: LocalSessionState) => void;
}

const SOUND_KEY = 'gtl_sound';

function persistSoundPref(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable (private mode) — non-essential */
  }
}

function initialState(): Pick<StoreState, 'pool' | 'rejected' | 'scores' | 'ui'> {
  return {
    pool: [],
    rejected: [],
    scores: null,
    ui: { soundOn: true, step: 'welcome', hydrated: false },
  };
}

export const useStore = create<StoreState>((set) => ({
  ...initialState(),

  addToPool: (game, status = 'finished') =>
    set((s) => {
      if (s.pool.some((e) => e.game.igdbId === game.igdbId)) return s;
      return { pool: [...s.pool, { game, status }] };
    }),

  removeFromPool: (igdbId) =>
    set((s) => ({ pool: s.pool.filter((e) => e.game.igdbId !== igdbId) })),

  markRejected: (igdbId) =>
    set((s) => (s.rejected.includes(igdbId) ? s : { rejected: [...s.rejected, igdbId] })),

  setScores: (scores) => set({ scores }),

  setStep: (step) => set((s) => ({ ui: { ...s.ui, step } })),

  goNext: () =>
    set((s) => {
      const i = STEP_ORDER.indexOf(s.ui.step);
      const next = STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)];
      return { ui: { ...s.ui, step: next } };
    }),

  goBack: () =>
    set((s) => {
      const i = STEP_ORDER.indexOf(s.ui.step);
      const prev = STEP_ORDER[Math.max(i - 1, 0)];
      return { ui: { ...s.ui, step: prev } };
    }),

  toggleSound: () =>
    set((s) => {
      const soundOn = !s.ui.soundOn;
      persistSoundPref(soundOn);
      return { ui: { ...s.ui, soundOn } };
    }),

  setSoundOn: (on) =>
    set((s) => {
      persistSoundPref(on);
      return { ui: { ...s.ui, soundOn: on } };
    }),

  setHydrated: (hydrated) => set((s) => ({ ui: { ...s.ui, hydrated } })),

  hydrate: ({ pool, rejected, scores, step }) =>
    set((s) => ({
      pool,
      rejected,
      scores,
      ui: { ...s.ui, step: resolveResumeStep(step, pool.length), hydrated: true },
    })),
}));

/* ------------------------------------------------------------------ autosave */

/** Debounce for the localStorage write and the pool-stats POST. */
const AUTOSAVE_MS = 600;

function poolEntryIds(s: StoreState): number[] {
  return s.pool.map((e) => e.game.igdbId);
}

/**
 * Subscribe to pool/rejected/scores/step changes and persist them. On any change we debounce a
 * write of the full state to localStorage (instant, offline resume). When the pool *ids* change
 * we also debounce a fire-and-forget POST /api/pool-stats carrying the previous→next delta — the
 * only server write, feeding the community co-occurrence aggregates.
 *
 * Started after hydration (see StoreHydrator), so the pool-delta baseline is the restored pool and
 * resuming never re-counts games recorded in a prior visit. Nothing persists while unhydrated
 * (Start over unhydrates before clearing + reloading).
 */
export function startAutosave(): () => void {
  const saveNow = () => {
    const s = useStore.getState();
    // A debounced write can still be queued when Start over unhydrates (its deadline may
    // elapse before the reload's pagehide) — never persist while unhydrated.
    if (!s.ui.hydrated) return;
    saveLocalSession({
      pool: s.pool,
      rejected: s.rejected,
      scores: s.scores,
      step: s.ui.step,
    });
  };
  const persist = debounce(saveNow, AUTOSAVE_MS);

  // Flush synchronously when the tab is hidden/closed so an action inside the debounce window
  // (e.g. decide a card, immediately close the tab) is never lost.
  const flush = () => {
    persist.cancel();
    saveNow();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisibilityChange);

  // Baseline of pool ids already recorded in the community aggregates; sent as `previous` and
  // advanced only when a sync actually fires.
  let syncedPoolIds = poolEntryIds(useStore.getState());
  const syncPool = debounce(() => {
    const next = poolEntryIds(useStore.getState());
    const previous = syncedPoolIds;
    syncedPoolIds = next;
    void fetch('/api/pool-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ previous, next }),
    }).catch(() => {
      /* best-effort community signal */
    });
  }, AUTOSAVE_MS);

  let prev = pickPersisted(useStore.getState());
  let prevPoolKey = poolEntryIds(useStore.getState()).join(',');
  const unsub = useStore.subscribe((state) => {
    if (!state.ui.hydrated) return;
    const next = pickPersisted(state);
    if (
      next.pool === prev.pool &&
      next.rejected === prev.rejected &&
      next.scores === prev.scores &&
      next.step === prev.step
    ) {
      return;
    }
    prev = next;
    persist();
    const poolKey = poolEntryIds(state).join(',');
    if (poolKey !== prevPoolKey) {
      prevPoolKey = poolKey;
      syncPool();
    }
  });

  return () => {
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    persist.cancel();
    syncPool.cancel();
    unsub();
  };
}

function pickPersisted(s: StoreState) {
  return { pool: s.pool, rejected: s.rejected, scores: s.scores, step: s.ui.step };
}

/** Test-only: reset the store's data slices to initial values (actions are preserved). */
export function resetStore(): void {
  useStore.setState(initialState());
}
