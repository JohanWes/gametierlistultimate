import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TierMap } from '@/lib/ranking';
import { LOCAL_SESSION_KEY } from '@/lib/session-local';
import { resetStore, useStore } from '@/lib/store';
import { mockFetch } from '@/test/helpers/fetch';
import { makeGame } from '@/test/helpers/games';
import { fireEvent, renderWithProviders, screen, waitFor, within } from '@/test/helpers/render';

import { ShareBar, useShare } from './ShareBar';

const games = [makeGame({ igdbId: 1, title: 'Alpha' }), makeGame({ igdbId: 2, title: 'Bravo' })];
const gamesById = new Map(games.map((g) => [g.igdbId, g]));
const tiers: TierMap = { S: [1], A: [2], B: [], C: [], D: [], E: [], F: [] };

function Harness({ tiers }: { tiers: TierMap }) {
  return <ShareBar share={useShare({ tiers, gamesById })} />;
}

describe('ShareBar', () => {
  beforeEach(() => resetStore());

  it('publishes a snapshot, shows the returned link, and drops it after an edit', async () => {
    const fetchMock = mockFetch(() => ({
      shareId: 'abc123xyz0',
      url: 'http://localhost/s/abc123xyz0',
    }));

    const { rerender } = renderWithProviders(<Harness tiers={tiers} />);

    fireEvent.click(screen.getByRole('button', { name: /share my list/i }));

    await waitFor(() =>
      expect(screen.getByText('http://localhost/s/abc123xyz0')).toBeInTheDocument(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/lists',
      expect.objectContaining({ method: 'POST' }),
    );
    // Snapshot embeds the placed games.
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.games).toHaveLength(2);
    expect(body.tiers.S).toEqual([1]);

    // Moving a game makes the link stale: it disappears and publishing is offered again.
    rerender(<Harness tiers={{ ...tiers, S: [], A: [1, 2] }} />);
    expect(screen.queryByText('http://localhost/s/abc123xyz0')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /share my list/i })).toBeInTheDocument();
  });

  it('offers a retry when publishing fails', async () => {
    mockFetch(() => Response.json({}, { status: 500 }));

    renderWithProviders(<Harness tiers={tiers} />);

    fireEvent.click(screen.getByRole('button', { name: /share my list/i }));

    await waitFor(() => expect(screen.getByText(/try again/i)).toBeInTheDocument());
  });

  it('unhydrates the store and clears the saved session when Start over is confirmed', () => {
    window.localStorage.setItem(
      LOCAL_SESSION_KEY,
      JSON.stringify({ pool: [], rejected: [], scores: {}, step: 'pool' }),
    );
    useStore.getState().setHydrated(true);

    // Record whether the session key still exists at the moment the store flips to
    // unhydrated: the confirm handler must unhydrate before clearing, otherwise the
    // lifecycle flush could resurrect the cleared session.
    let keyPresentAtUnhydrate: boolean | null = null;
    const unsub = useStore.subscribe((s) => {
      if (keyPresentAtUnhydrate === null && !s.ui.hydrated) {
        keyPresentAtUnhydrate = window.localStorage.getItem(LOCAL_SESSION_KEY) !== null;
      }
    });

    try {
      renderWithProviders(<Harness tiers={tiers} />);
      // jsdom reports its unimplemented reload through console.error after the handler completes.
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      fireEvent.click(screen.getByRole('button', { name: /start over/i }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /start over/i }));
      consoleError.mockRestore();

      expect(keyPresentAtUnhydrate).toBe(true);
      expect(useStore.getState().ui.hydrated).toBe(false);
      expect(window.localStorage.getItem(LOCAL_SESSION_KEY)).toBeNull();
    } finally {
      unsub();
    }
  });
});
