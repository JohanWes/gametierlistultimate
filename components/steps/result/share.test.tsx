import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TierMap } from '@/lib/ranking';
import { resetStore } from '@/lib/store';
import { makeGame } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor } from '@/test/helpers/render';

import { ShareBar } from './ShareBar';

const games = [makeGame({ igdbId: 1, title: 'Alpha' }), makeGame({ igdbId: 2, title: 'Bravo' })];
const gamesById = new Map(games.map((g) => [g.igdbId, g]));
const tiers: TierMap = { S: [1], A: [2], B: [], C: [], D: [], E: [], F: [] };

describe('ShareBar', () => {
  beforeEach(() => resetStore());

  it('publishes a snapshot and shows the returned link', async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          status: 201,
          json: async () => ({ shareId: 'abc123xyz0', url: 'http://localhost/s/abc123xyz0' }),
        }) as Response,
    );

    renderWithProviders(
      <ShareBar tiers={tiers} gamesById={gamesById} fetchImpl={fetchImpl as unknown as typeof fetch} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share my list/i }));

    await waitFor(() =>
      expect(screen.getByText('http://localhost/s/abc123xyz0')).toBeInTheDocument(),
    );

    expect(fetchImpl).toHaveBeenCalledWith('/api/lists', expect.objectContaining({ method: 'POST' }));
    // Snapshot embeds the placed games.
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.games).toHaveLength(2);
    expect(body.tiers.S).toEqual([1]);
  });

  it('offers a retry when publishing fails', async () => {
    const fetchImpl = vi.fn(
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response,
    );

    renderWithProviders(
      <ShareBar tiers={tiers} gamesById={gamesById} fetchImpl={fetchImpl as unknown as typeof fetch} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share my list/i }));

    await waitFor(() => expect(screen.getByText(/try again/i)).toBeInTheDocument());
  });
});
