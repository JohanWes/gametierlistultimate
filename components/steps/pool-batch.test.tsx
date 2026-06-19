import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStore } from '@/lib/store';
import { makeGame, makeGames } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { PoolStep } from './PoolStep';

function excludeParam(url: string): string | null {
  return new URL(url, 'http://localhost').searchParams.get('exclude');
}

function listParam(url: string, name: string): string[] {
  return (new URL(url, 'http://localhost').searchParams.get(name) ?? '').split(',').filter(Boolean);
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
    expect(excludeParam(calls[1])?.split(',').sort()).toEqual([
      '1000',
      '1001',
      '1002',
      '1003',
      '1004',
    ]);

    // Decide distinct cards — the backlog feeds replacements so five stay on screen.
    for (const button of screen.getAllByRole('button', { name: /pass/i }).slice(0, 4)) {
      fireEvent.click(button);
    }

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

    // After several decisions the exclude must have grown well past the initial five.
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

  it('sends selected games as seeds and passed games as soft rejects for future batches', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      const excluded = listParam(url, 'exclude');
      const start = 1000 + excluded.length;
      return { ok: true, status: 200, json: async () => ({ games: makeGames(5, start) }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} />);

    await screen.findAllByRole('button', { name: /played it/i });
    await waitFor(() => expect(calls).toHaveLength(2));

    fireEvent.click(screen.getAllByRole('button', { name: /played it/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /pass/i })[1]);
    fireEvent.click(screen.getAllByRole('button', { name: /skip/i })[2]);
    fireEvent.click(screen.getAllByRole('button', { name: /skip/i })[3]);

    await waitFor(() => {
      expect(calls.some((url) => listParam(url, 'seedIds').includes('1000'))).toBe(true);
      expect(calls.some((url) => listParam(url, 'rejectIds').includes('1001'))).toBe(true);
    });
  });

  it('ignores duplicate games returned by a later batch', async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      const games =
        call === 1
          ? makeGames(5, 1)
          : [
              makeGame({ igdbId: 1, title: 'Game 1' }),
              makeGame({ igdbId: 2, title: 'Game 2' }),
              makeGame({ igdbId: 6, title: 'Game 6' }),
              makeGame({ igdbId: 6, title: 'Game 6' }),
              makeGame({ igdbId: 7, title: 'Game 7' }),
            ];
      return { ok: true, status: 200, json: async () => ({ games }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} />);

    await screen.findAllByRole('button', { name: /pass/i });
    await waitFor(() => expect(call).toBe(2));

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getAllByRole('button', { name: /pass/i })[0]);
    }

    await waitFor(() => {
      expect(screen.getAllByText('Game 6')).toHaveLength(2);
    });
  });

  it('ignores repeated decisions for the same card', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const excluded = listParam(url, 'exclude');
      const start = excluded.length === 0 ? 1 : 6;
      return { ok: true, status: 200, json: async () => ({ games: makeGames(5, start) }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} />);

    await screen.findAllByRole('button', { name: /pass/i });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    const firstPass = screen.getAllByRole('button', { name: /pass/i })[0];
    fireEvent.click(firstPass);
    fireEvent.click(firstPass);
    fireEvent.click(firstPass);

    await waitFor(() => {
      expect(screen.getAllByText('Game 6')).toHaveLength(2);
    });
    expect(screen.queryByText('Game 7')).not.toBeInTheDocument();
  });
});
