import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetStore, useStore } from '@/lib/store';
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
      const games = makeGames(3, start);
      return { ok: true, status: 200, json: async () => ({ games }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} random={() => 1} />);

    // First batch lands — exclude is empty.
    await screen.findAllByRole('button', { name: /pass/i });
    expect(excludeParam(calls[0])).toBeNull();

    // The backlog prefetch fires immediately, excluding the visible three.
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(excludeParam(calls[1])?.split(',').sort()).toEqual(['1000', '1001', '1002']);

    // Decide distinct cards — the backlog feeds replacements so three stay on screen.
    for (const button of screen.getAllByRole('button', { name: /pass/i }).slice(0, 3)) {
      fireEvent.click(button);
    }

    // Wait for the backlog refill to fire.
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));

    // Let exit/enter animations (mode="wait") settle. With 180ms tweens the
    // exit + enter cycles should resolve well within this window.
    await waitFor(
      () => {
        expect(screen.getAllByRole('button', { name: /pass/i })).toHaveLength(3);
      },
      { timeout: 2500 },
    );

    // After several decisions the exclude must have grown well past the initial three.
    // It contains every seen id (decided + visible slots + backlog), with zero duplicates.
    const latestExclude = excludeParam(calls[calls.length - 1]);
    expect(latestExclude).not.toBeNull();
    const latestIds = latestExclude!.split(',').map(Number);
    expect(latestIds.length).toBeGreaterThan(3);
    expect(new Set(latestIds).size).toBe(latestIds.length);
  });

  it('shows placeholders (no crash) when the API returns fewer than three games', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const excluded = (new URL(url, 'http://localhost').searchParams.get('exclude') ?? '')
        .split(',')
        .filter(Boolean);
      const count = excluded.length === 0 ? 1 : 0;
      const start = 1000 + excluded.length;
      return { ok: true, status: 200, json: async () => ({ games: makeGames(count, start) }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} random={() => 1} />);

    // First batch has only 1 card, the other 2 slots show a placeholder — no crash.
    await screen.findAllByRole('button', { name: /pass/i });
    const placeholders = await screen.findAllByText(/no more suggestions/i);
    expect(placeholders).toHaveLength(2);
    // The grid is still 3-wide — the placeholder text appears.
  });

  it('shows the exhausted shelf when every suggestion has been excluded', async () => {
    const fetchImpl = vi.fn(async () => {
      return { ok: true, status: 200, json: async () => ({ games: [] }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} random={() => 1} />);

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

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} random={() => 1} />);

    const retry = await screen.findByRole('button', { name: /retry now/i });
    expect(screen.queryByText(/whole shelf/i)).not.toBeInTheDocument();

    fireEvent.click(retry);
    expect(await screen.findAllByRole('button', { name: /played it/i })).toHaveLength(3);
  });

  it('sends selected games as seeds and passed games as soft rejects for future batches', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      const excluded = listParam(url, 'exclude');
      const start = 1000 + excluded.length;
      return { ok: true, status: 200, json: async () => ({ games: makeGames(3, start) }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} random={() => 1} />);

    await screen.findAllByRole('button', { name: /played it/i });
    await waitFor(() => expect(calls).toHaveLength(2));

    // Accept the first card (a seed). Wait for its replacement to mount so the passes below land
    // on live cards (not the exiting one) and drain the backlog past the refill mark, forcing a
    // refill fetch that carries the seed/reject context forward.
    fireEvent.click(screen.getAllByRole('button', { name: /played it/i })[0]);
    await screen.findByText('Game 1003');
    for (const button of screen.getAllByRole('button', { name: /pass/i })) {
      fireEvent.click(button);
    }

    await waitFor(() => {
      expect(calls.some((url) => listParam(url, 'seedIds').includes('1000'))).toBe(true);
      expect(calls.some((url) => listParam(url, 'rejectIds').includes('1001'))).toBe(true);
    });
  });

  it('seeds exclude/reject context from a resumed rejected list and never re-shows those games', async () => {
    // Simulate a resume: previously passed-on game 1001 restored into the store.
    useStore.getState().hydrate({ rejected: [1001], step: 'pool' });

    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      // The API echoes the rejected game back alongside fresh ones; the client must filter it.
      const games = [makeGame({ igdbId: 1001, title: 'Rejected 1001' }), ...makeGames(3, 2000)];
      return { ok: true, status: 200, json: async () => ({ games }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} random={() => 1} />);

    await screen.findAllByRole('button', { name: /pass/i });

    expect(listParam(calls[0], 'exclude')).toContain('1001');
    expect(listParam(calls[0], 'rejectIds')).toContain('1001');
    expect(screen.queryByText('Rejected 1001')).not.toBeInTheDocument();
  });

  it('persists a pass into the store so the rejection survives a resume', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const start = 1 + listParam(url, 'exclude').length;
      return { ok: true, status: 200, json: async () => ({ games: makeGames(3, start) }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} random={() => 1} />);

    await screen.findAllByRole('button', { name: /pass/i });
    fireEvent.click(screen.getAllByRole('button', { name: /pass/i })[0]);

    await waitFor(() => expect(useStore.getState().rejected).toContain(1));
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

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} random={() => 1} />);

    await screen.findAllByRole('button', { name: /pass/i });
    // The backlog refill (and any catch-up refill it chains) repeats game 6; the client must
    // dedupe it across batches.
    await waitFor(() => expect(call).toBeGreaterThanOrEqual(2));

    // Deciding one card pulls game 6 in from the backlog; it must surface exactly once.
    fireEvent.click(screen.getAllByRole('button', { name: /pass/i })[0]);

    await waitFor(() => {
      expect(screen.getAllByText('Game 6')).toHaveLength(1);
    });
  });

  it('ignores repeated decisions for the same card', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const excluded = listParam(url, 'exclude');
      const start = excluded.length === 0 ? 1 : 6;
      return { ok: true, status: 200, json: async () => ({ games: makeGames(5, start) }) };
    }) as unknown as typeof fetch;

    renderWithProviders(<PoolStep fetchImpl={fetchImpl} random={() => 1} />);

    await screen.findAllByRole('button', { name: /pass/i });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));

    const firstPass = screen.getAllByRole('button', { name: /pass/i })[0];
    fireEvent.click(firstPass);
    fireEvent.click(firstPass);
    fireEvent.click(firstPass);

    await waitFor(() => {
      expect(screen.getAllByText('Game 6')).toHaveLength(1);
    });
    expect(screen.queryByText('Game 7')).not.toBeInTheDocument();
  });
});
