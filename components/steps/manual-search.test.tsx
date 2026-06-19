import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStore, useStore } from '@/lib/store';
import { makeResult } from '@/test/helpers/games';
import { act, fireEvent, renderWithProviders, screen } from '@/test/helpers/render';

import { ManualSearch } from './ManualSearch';

describe('ManualSearch', () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('debounces typing into a single search request', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ results: [] }) })) as unknown as typeof fetch;
    renderWithProviders(<ManualSearch fetchImpl={fetchImpl} />);

    const input = screen.getByRole('searchbox', { name: /search games/i });
    fireEvent.change(input, { target: { value: 'zel' } });
    fireEvent.change(input, { target: { value: 'zelda' } });

    expect(fetchImpl).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('q=zelda');
  });

  it('adds a local search result to the pool', async () => {
    const results = [makeResult({ igdbId: 7, title: 'Celeste', source: 'local' })];
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ results }) })) as unknown as typeof fetch;
    renderWithProviders(<ManualSearch fetchImpl={fetchImpl} />);

    fireEvent.change(screen.getByRole('searchbox', { name: /search games/i }), {
      target: { value: 'celeste' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    fireEvent.click(screen.getByRole('button', { name: /celeste/i }));
    expect(useStore.getState().pool.map((e) => e.game.igdbId)).toContain(7);
  });

  it('adds an IGDB-sourced fallback result to the pool', async () => {
    const results = [makeResult({ igdbId: 99, title: 'Obscure Gem', source: 'igdb' })];
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ results }) })) as unknown as typeof fetch;
    renderWithProviders(<ManualSearch fetchImpl={fetchImpl} />);

    fireEvent.change(screen.getByRole('searchbox', { name: /search games/i }), {
      target: { value: 'obscure' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByText(/from igdb/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /obscure gem/i }));
    expect(useStore.getState().pool.map((e) => e.game.igdbId)).toContain(99);
  });
});
