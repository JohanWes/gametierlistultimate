import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Game } from '@/lib/games/types';
import { peekAdaptiveBatch, peekStarterBatch, resetStarterBatchPrefetch } from '@/lib/games/prefetch';
import { LOCAL_SESSION_KEY, type LocalSessionState } from '@/lib/session-local';
import { initAudio, setMuted } from '@/lib/sound';
import { resetStore, useStore } from '@/lib/store';
import { act, renderWithProviders, waitFor } from '@/test/helpers/render';

import { StoreHydrator } from './StoreHydrator';

vi.mock('@/lib/sound', () => ({
  playSound: vi.fn(),
  initAudio: vi.fn(),
  setMuted: vi.fn(),
  isMuted: () => false,
}));

function game(igdbId: number): Game {
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

function seedLocalSession(state: LocalSessionState) {
  window.localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(state));
}

function readLocalSession() {
  const raw = window.localStorage.getItem(LOCAL_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

describe('StoreHydrator', () => {
  beforeEach(() => {
    resetStore();
    resetStarterBatchPrefetch();
    window.localStorage.clear();
  });

  afterEach(async () => {
    // Let an in-flight prefetch settle before clearing the module cache; otherwise an older
    // rejection can race the next test and clear its newly-started promise.
    await peekStarterBatch();
    await peekAdaptiveBatch();
    resetStarterBatchPrefetch();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('restores the saved pool (with statuses) and step from localStorage without any network', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchImpl);

    const pool = Array.from({ length: 12 }, (_, i) => ({
      game: game(i + 1),
      status: 'played-a-lot' as const,
    }));
    seedLocalSession({ pool, rejected: [], scores: {}, step: 'arcade' });

    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    expect(useStore.getState().pool.map((e) => e.game.igdbId)).toEqual(pool.map((e) => e.game.igdbId));
    expect(useStore.getState().pool.every((e) => e.status === 'played-a-lot')).toBe(true);
    expect(useStore.getState().ui.step).toBe('arcade');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('restores rejected ids from localStorage without any network', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchImpl);

    seedLocalSession({
      pool: [],
      rejected: [101, 102, 103],
      scores: {},
      step: 'pool',
    });

    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    expect(useStore.getState().rejected).toEqual([101, 102, 103]);
  });

  it('falls back to the pool step when the saved pool is too small for an advanced step', async () => {
    const pool = [1, 2, 3].map((id) => ({ game: game(id), status: 'finished' as const }));
    seedLocalSession({ pool, rejected: [], scores: {}, step: 'reveal' });

    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    expect(useStore.getState().pool.map((e) => e.game.igdbId)).toEqual([1, 2, 3]);
    expect(useStore.getState().ui.step).toBe('pool');
  });

  it('stays on the welcome step when there is no saved local session', async () => {
    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    expect(useStore.getState().pool).toEqual([]);
    expect(useStore.getState().ui.step).toBe('welcome');
  });

  it('does not restore the persisted mute preference or touch the sound module', async () => {
    window.localStorage.setItem('gtl_sound', 'off');
    seedLocalSession({ pool: [], rejected: [], scores: {}, step: 'arcade' });

    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    // Mute restore is SoundHydrator's job — the store keeps its default (sound on).
    expect(useStore.getState().ui.soundOn).toBe(true);
    expect(setMuted).not.toHaveBeenCalled();
  });

  it('does not register first-gesture audio initialization listeners', async () => {
    seedLocalSession({ pool: [], rejected: [], scores: {}, step: 'arcade' });

    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    window.dispatchEvent(new Event('touchstart'));

    expect(initAudio).not.toHaveBeenCalled();
  });

  it('starts debounced autosave so store changes persist to localStorage', () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchImpl);

    renderWithProviders(<StoreHydrator />);
    expect(useStore.getState().ui.hydrated).toBe(true);

    act(() => {
      useStore.getState().addToPool(game(1));
    });
    expect(readLocalSession()).toBeNull(); // still within the debounce window

    vi.advanceTimersByTime(600);

    const saved = readLocalSession();
    expect(saved.pool).toEqual([{ game: game(1), status: 'finished' }]);
  });

  it('prefetches the starter shelf for a cold pool', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ games: [] }) }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchImpl);

    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    expect(peekStarterBatch()).not.toBeNull();
    expect(peekAdaptiveBatch()).toBeNull();
  });

  it('prefetches an adaptive batch seeded by a warm pool', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ games: [] }) }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchImpl);

    seedLocalSession({
      pool: [1, 2].map((id) => ({ game: game(id), status: 'finished' as const })),
      rejected: [3],
      scores: {},
      step: 'pool',
    });

    renderWithProviders(<StoreHydrator />);

    await waitFor(() => expect(useStore.getState().ui.hydrated).toBe(true));

    expect(peekAdaptiveBatch()).not.toBeNull();
    expect(peekStarterBatch()).toBeNull();
  });
});
