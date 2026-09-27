import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStore, useStore } from '@/lib/store';
import { mockFetch } from '@/test/helpers/fetch';
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
    const fetchMock = mockFetch(() => ({ results: [] }));
    renderWithProviders(<ManualSearch />);

    const input = screen.getByRole('searchbox', { name: /search games/i });
    fireEvent.change(input, { target: { value: 'zel' } });
    fireEvent.change(input, { target: { value: 'zelda' } });

    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('q=zelda');
  });

  it('adds a local search result to the pool', async () => {
    const results = [makeResult({ igdbId: 7, title: 'Celeste', source: 'local' })];
    mockFetch(() => ({ results }));
    renderWithProviders(<ManualSearch />);

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
    mockFetch(() => ({ results }));
    renderWithProviders(<ManualSearch />);

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

  it('clears the query with the clear button', async () => {
    const results = [makeResult({ igdbId: 7, title: 'Celeste', source: 'local' })];
    mockFetch(() => ({ results }));
    renderWithProviders(<ManualSearch />);

    const input = screen.getByRole('searchbox', { name: /search games/i });
    fireEvent.change(input, { target: { value: 'celeste' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByRole('button', { name: /celeste/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(input).toHaveValue('');
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();
  });
});
