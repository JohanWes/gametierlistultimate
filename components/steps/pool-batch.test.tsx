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

  it('prefetches the backlog with the visible games excluded, then refills as cards are decided', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      // Each call returns unique games keyed by the exclude size, so duplicates
      // are impossible and we can assert exact exclude params.
      const excluded = (new URL(url, 'http://localhost').searchParams.get('exclude') ?? '')
        .split(',')
        .filter(Boolean);
      const start = 1000 + excluded.length;
      const games = makeGames(5, start);
      return { ok: true, status: 200, json: async () => ({ games }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} />);

    // First batch lands — exclude is empty.
    await screen.findAllByRole('button', { name: /pass/i });
    expect(excludeParam(calls[0])).toBeNull();

    // The backlog prefetch fires immediately, excluding the visible five.
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(excludeParam(calls[1])?.split(',').sort()).toEqual(
      ['1000', '1001', '1002', '1003', '1004'],
    );

    // Decide cards repeatedly — the backlog feeds replacements so five stay on screen.
    const passBtn = () => screen.getAllByRole('button', { name: /pass/i })[0];
    for (let i = 0; i < 6; i += 1) fireEvent.click(passBtn());

    // Wait for the backlog refill to fire.
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));

    // Let exit/enter animations (mode="wait") settle. With 180ms tweens the
    // exit + enter cycles should resolve well within this window.
    await waitFor(
      () => {
        expect(screen.getAllByRole('button', { name: /pass/i })).toHaveLength(5);
      },
      { timeout: 2500 },
    );

    // After six decisions the exclude must have grown well past the initial five.
    // It contains every seen id (decided + visible slots + backlog), with zero duplicates.
    const latestExclude = excludeParam(calls[calls.length - 1]);
    expect(latestExclude).not.toBeNull();
    const latestIds = latestExclude!.split(',').map(Number);
    expect(latestIds.length).toBeGreaterThan(5);
    expect(new Set(latestIds).size).toBe(latestIds.length);
  });

  it('shows placeholders (no crash) when the API returns fewer than five games', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const excluded = (new URL(url, 'http://localhost').searchParams.get('exclude') ?? '')
        .split(',')
        .filter(Boolean);
      const count = excluded.length === 0 ? 3 : 0;
      const start = 1000 + excluded.length;
      return { ok: true, status: 200, json: async () => ({ games: makeGames(count, start) }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} />);

    // First batch has only 3 cards, the other 2 slots show a placeholder — no crash.
    await screen.findAllByRole('button', { name: /pass/i });
    const placeholders = await screen.findAllByText(/no more suggestions/i);
    expect(placeholders).toHaveLength(2);
    // The grid is still 5-wide — the placeholder text appears.
  });

  it('shows the exhausted shelf when every suggestion has been excluded', async () => {
    const fetchImpl = vi.fn(async () => {
      return { ok: true, status: 200, json: async () => ({ games: [] }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} />);

    await waitFor(() => {
      expect(screen.getByText(/whole shelf/i)).toBeInTheDocument();
    });
  });

  it('shows a recoverable error when the first fetch fails', async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      if (n++ === 0) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ games: makeGames(5, 1000) }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} />);

    const retry = await screen.findByRole('button', { name: /retry now/i });
    expect(screen.queryByText(/whole shelf/i)).not.toBeInTheDocument();

    fireEvent.click(retry);
    expect(await screen.findAllByRole('button', { name: /played it/i })).toHaveLength(5);
  });
});
