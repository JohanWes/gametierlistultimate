import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStore } from '@/lib/store';
import { makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { PoolStep } from './PoolStep';

function excludeParam(url: string): string | null {
  return new URL(url, 'http://localhost').searchParams.get('exclude');
}

describe('PoolStep batches', () => {
  beforeEach(() => resetStore());

  it('requests the first batch with an empty exclude, then excludes decided games next', async () => {
    const calls: string[] = [];
    let n = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      const games = n++ === 0 ? makeGames(5, 1) : makeGames(5, 6);
      return { ok: true, status: 200, json: async () => ({ games }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} />);

    // First batch lands.
    const passButtons = await screen.findAllByRole('button', { name: /pass/i });
    expect(passButtons).toHaveLength(5);
    expect(excludeParam(calls[0])).toBeNull();

    // Decide every card → the batch empties and the next one is requested.
    for (const button of screen.getAllByRole('button', { name: /pass/i })) {
      fireEvent.click(button);
    }

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(excludeParam(calls[1])?.split(',').sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('shows a recoverable error (not the exhausted dead-end) when the first fetch fails', async () => {
    // First call fails, retry succeeds — proves a failed load does not become "whole shelf".
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      if (n++ === 0) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ games: makeGames(5, 1) }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} />);

    // The error state offers a manual retry and never claims the shelf is empty.
    const retry = await screen.findByRole('button', { name: /retry now/i });
    expect(screen.queryByText(/whole shelf/i)).not.toBeInTheDocument();

    fireEvent.click(retry);
    expect(await screen.findAllByRole('button', { name: /played it/i })).toHaveLength(5);
  });
});
