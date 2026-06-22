'use client';

import { create } from 'zustand';

import { resolveResumeStep, STEP_ORDER, type Step } from '@/lib/flow';
import type { Game } from '@/lib/games/types';
import { saveLocalSession } from '@/lib/session-local';
import { debounce } from '@/lib/utils';

export { MIN_POOL, STEP_ORDER, type Step } from '@/lib/flow';

/* ------------------------------------------------------------------ slice shapes */

export type PlayedStatus = 'tried' | 'finished' | 'played-a-lot';

export interface PoolEntry {
  game: Game;
  status: PlayedStatus;
}

/** Onboarding preferences. `flags` holds the boolean toggles (older, indie, chaos, …). */
export interface PrefsState {
  genres: string[];
  platforms: string[];
  flags: Record<string, boolean>;
}

export type ArcadePhase = 'early' | 'late';

export interface ArcadeState {
  phase: ArcadePhase;
  round: number;
}

export interface UiState {
  soundOn: boolean;
  step: Step;
  hydrated: boolean;
}

/* ------------------------------------------------------------------ store */

export interface StoreState {
  prefs: PrefsState;
  /** Games the user has added, with played status. Live UI source of truth. */
  pool: PoolEntry[];
  /**
   * Every game id the user has passed on (rejected) in the pool picker. Persisted in full so
   * resume never re-shows them; only a recent slice is sent to the server (see PoolStep).
   */
  rejected: number[];
  /** Opaque hidden ranking state (filled by the Phase 6 engine). */
  scores: Record<string, unknown>;
  arcade: ArcadeState;
  ui: UiState;

  // prefs actions
  toggleGenre: (genre: string) => void;
  setPlatforms: (platforms: string[]) => void;
  setFlag: (flag: string, value: boolean) => void;

  // pool actions
  addToPool: (game: Game, status?: PlayedStatus) => void;
  removeFromPool: (igdbId: number) => void;
  setPlayedStatus: (igdbId: number, status: PlayedStatus) => void;
  markRejected: (igdbId: number) => void;

  // scores / arcade
  setScores: (scores: Record<string, unknown>) => void;
  setArcade: (partial: Partial<ArcadeState>) => void;

  // flow + ui
  setStep: (step: Step) => void;
  goNext: () => void;
  goBack: () => void;
  toggleSound: () => void;
  setSoundOn: (on: boolean) => void;
  setHydrated: (hydrated: boolean) => void;

  // persistence
  hydrate: (saved: {
    prefs?: unknown;
    pool?: unknown;
    rejected?: unknown;
    scores?: unknown;
    step?: unknown;
  }) => void;
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

function initialState(): Pick<
  StoreState,
  'prefs' | 'pool' | 'rejected' | 'scores' | 'arcade' | 'ui'
> {
  return {
    prefs: { genres: [], platforms: [], flags: {} },
    pool: [],
    rejected: [],
    scores: {},
    arcade: { phase: 'early', round: 0 },
    ui: { soundOn: true, step: 'welcome', hydrated: false },
  };
}

export const useStore = create<StoreState>((set, get) => ({
  ...initialState(),

  toggleGenre: (genre) =>
    set((s) => {
      const has = s.prefs.genres.includes(genre);
      return {
        prefs: {
          ...s.prefs,
          genres: has ? s.prefs.genres.filter((g) => g !== genre) : [...s.prefs.genres, genre],
        },
      };
    }),

  setPlatforms: (platforms) => set((s) => ({ prefs: { ...s.prefs, platforms } })),

  setFlag: (flag, value) =>
    set((s) => ({ prefs: { ...s.prefs, flags: { ...s.prefs.flags, [flag]: value } } })),

  addToPool: (game, status = 'finished') =>
    set((s) => {
      if (s.pool.some((e) => e.game.igdbId === game.igdbId)) return s;
      return { pool: [...s.pool, { game, status }] };
    }),

  removeFromPool: (igdbId) =>
    set((s) => ({ pool: s.pool.filter((e) => e.game.igdbId !== igdbId) })),

  setPlayedStatus: (igdbId, status) =>
    set((s) => ({
      pool: s.pool.map((e) => (e.game.igdbId === igdbId ? { ...e, status } : e)),
    })),

  markRejected: (igdbId) =>
    set((s) => (s.rejected.includes(igdbId) ? s : { rejected: [...s.rejected, igdbId] })),

  setScores: (scores) => set({ scores }),

  setArcade: (partial) => set((s) => ({ arcade: { ...s.arcade, ...partial } })),

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

  hydrate: (saved) => {
    const patch: Partial<StoreState> = {};
    if (saved.prefs && typeof saved.prefs === 'object') {
      const p = saved.prefs as Partial<PrefsState>;
      patch.prefs = {
        genres: Array.isArray(p.genres) ? p.genres : get().prefs.genres,
        platforms: Array.isArray(p.platforms) ? p.platforms : get().prefs.platforms,
        flags: p.flags && typeof p.flags === 'object' ? p.flags : get().prefs.flags,
      };
    }
    if (Array.isArray(saved.pool)) {
      // Full pool entries (game + played status) are stored locally, so resume restores both
      // without any network round-trip.
      const pool: PoolEntry[] = (saved.pool as unknown[]).filter(
        (entry): entry is PoolEntry =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          typeof (entry as PoolEntry).game?.igdbId === 'number',
      );
      patch.pool = pool;
    }
    if (Array.isArray(saved.rejected)) {
      patch.rejected = [
        ...new Set(saved.rejected.filter((id): id is number => Number.isFinite(id))),
      ];
    }
    if (saved.scores && typeof saved.scores === 'object') {
      patch.scores = saved.scores as Record<string, unknown>;
    }
    const poolCount = patch.pool?.length ?? get().pool.length;
    const step = resolveResumeStep(saved.step, poolCount);
    set({ ...patch, ui: { ...get().ui, step, hydrated: true } });
  },
}));

/* ------------------------------------------------------------------ autosave */

function poolEntryIds(s: StoreState): number[] {
  return s.pool.map((e) => e.game.igdbId);
}

/**
 * Subscribe to prefs/pool/scores/step changes and persist them. On any change we debounce a
 * write of the full state to localStorage (instant, offline resume). When the pool *ids* change
 * we also debounce a fire-and-forget POST /api/pool-stats carrying the previous→next delta — the
 * only remaining server write, feeding the community co-occurrence aggregates.
 *
 * Only persists after hydration so we never clobber restored state with empty defaults. The pool
 * delta baseline is reset to the restored pool at hydration, so resuming never re-counts games
 * already recorded in a prior visit. Accepts injectable `fetchImpl`/`waitMs` for testing.
 */
export function startAutosave(opts?: { waitMs?: number; fetchImpl?: typeof fetch }): () => void {
  const waitMs = opts?.waitMs ?? 600;
  const doFetch = opts?.fetchImpl ?? fetch;

  const persist = debounce(() => {
    const s = useStore.getState();
    saveLocalSession({
      prefs: s.prefs,
      pool: s.pool,
      rejected: s.rejected,
      scores: s.scores,
      step: s.ui.step,
    });
  }, waitMs);

  // Baseline of pool ids already recorded in the community aggregates; sent as `previous` and
  // advanced only when a sync actually fires.
  let syncedPoolIds = poolEntryIds(useStore.getState());
  const syncPool = debounce(() => {
    const next = poolEntryIds(useStore.getState());
    const previous = syncedPoolIds;
    syncedPoolIds = next;
    void doFetch('/api/pool-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ previous, next }),
    }).catch(() => {
      /* best-effort community signal */
    });
  }, waitMs);

  let prev = pickPersisted(useStore.getState());
  let prevPoolKey = poolEntryIds(useStore.getState()).join(',');
  let wasHydrated = useStore.getState().ui.hydrated;
  const unsub = useStore.subscribe((state) => {
    const next = pickPersisted(state);
    const nextPoolKey = poolEntryIds(state).join(',');
    if (!wasHydrated && state.ui.hydrated) {
      wasHydrated = true;
      prev = next;
      prevPoolKey = nextPoolKey;
      syncedPoolIds = poolEntryIds(state);
      return;
    }
    if (
      next.prefs !== prev.prefs ||
      next.pool !== prev.pool ||
      next.rejected !== prev.rejected ||
      next.scores !== prev.scores ||
      next.step !== prev.step
    ) {
      const poolIdsChanged = nextPoolKey !== prevPoolKey;
      prev = next;
      prevPoolKey = nextPoolKey;
      if (state.ui.hydrated) {
        persist();
        if (poolIdsChanged) syncPool();
      }
    }
  });

  return () => {
    persist.cancel();
    syncPool.cancel();
    unsub();
  };
}

function pickPersisted(s: StoreState) {
  return { prefs: s.prefs, pool: s.pool, rejected: s.rejected, scores: s.scores, step: s.ui.step };
}

/** Test-only: reset the store's data slices to initial values (actions are preserved). */
export function resetStore(): void {
  useStore.setState(initialState());
}
