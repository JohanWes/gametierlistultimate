'use client';

import { create } from 'zustand';

import type { Game } from '@/lib/games/types';
import { debounce } from '@/lib/utils';

/* ------------------------------------------------------------------ flow machine */

export type Step = 'welcome' | 'onboarding' | 'pool' | 'arcade' | 'reveal';

/**
 * Linear order of the flow. `goNext`/`goBack` walk this array. `reveal` is terminal: it hosts the
 * animated reveal, the editable tier list (manual correction), and the share action on one screen.
 */
export const STEP_ORDER: Step[] = ['welcome', 'onboarding', 'pool', 'arcade', 'reveal'];

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
  /** Saved pool ids from a prior session, before full game objects are re-fetched (Phase 5). */
  poolIds: number[];
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
  hydrate: (saved: { prefs?: unknown; pool?: unknown; scores?: unknown }) => void;
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
  'prefs' | 'pool' | 'poolIds' | 'scores' | 'arcade' | 'ui'
> {
  return {
    prefs: { genres: [], platforms: [], flags: {} },
    pool: [],
    poolIds: [],
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
      patch.poolIds = (saved.pool as unknown[]).filter((n): n is number => typeof n === 'number');
    }
    if (saved.scores && typeof saved.scores === 'object') {
      patch.scores = saved.scores as Record<string, unknown>;
    }
    set({ ...patch, ui: { ...get().ui, hydrated: true } });
  },
}));

/* ------------------------------------------------------------------ autosave */

/** The ids we persist for the pool: live entries if present, else the saved ids. */
function poolIdsForSave(s: StoreState): number[] {
  return s.pool.length ? s.pool.map((e) => e.game.igdbId) : s.poolIds;
}

/**
 * Subscribe to prefs/pool/scores changes and debounce a PUT /api/session. Returns an
 * unsubscribe function. Only saves after hydration so we never clobber a restored session
 * with empty defaults. Accepts injectable `fetchImpl`/`waitMs` for testing.
 */
export function startAutosave(opts?: { waitMs?: number; fetchImpl?: typeof fetch }): () => void {
  const waitMs = opts?.waitMs ?? 600;
  const doFetch = opts?.fetchImpl ?? fetch;

  const save = debounce(() => {
    const s = useStore.getState();
    void doFetch('/api/session', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        prefs: s.prefs,
        pool: poolIdsForSave(s),
        scores: s.scores,
      }),
    }).catch(() => {
      /* autosave is best-effort */
    });
  }, waitMs);

  let prev = pickPersisted(useStore.getState());
  const unsub = useStore.subscribe((state) => {
    const next = pickPersisted(state);
    if (next.prefs !== prev.prefs || next.pool !== prev.pool || next.scores !== prev.scores) {
      prev = next;
      if (state.ui.hydrated) save();
    }
  });

  return () => {
    save.cancel();
    unsub();
  };
}

function pickPersisted(s: StoreState) {
  return { prefs: s.prefs, pool: s.pool, scores: s.scores };
}

/** Test-only: reset the store's data slices to initial values (actions are preserved). */
export function resetStore(): void {
  useStore.setState(initialState());
}
