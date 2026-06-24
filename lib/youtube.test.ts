import { describe, expect, it, vi } from 'vitest';

import { gameplayQuery, searchGameplayVideo } from './youtube';

/** Build a YouTube results page HTML wrapping the given ytInitialData payload. */
function resultsHtml(items: unknown[]): string {
  const data = {
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [{ itemSectionRenderer: { contents: items } }],
          },
        },
      },
    },
  };
  return `<!doctype html><html><body><script>var ytInitialData = ${JSON.stringify(
    data,
  )};</script></body></html>`;
}

function video(videoId: string, title: string) {
  return { videoRenderer: { videoId, title: { runs: [{ text: title }] } } };
}

function okFetch(html: string): typeof fetch {
  return vi.fn().mockResolvedValue({ ok: true, text: async () => html }) as unknown as typeof fetch;
}

describe('gameplayQuery', () => {
  it('builds a playthrough-oriented search term', () => {
    expect(gameplayQuery('Hollow Knight')).toBe('Hollow Knight full gameplay walkthrough');
  });
});

describe('searchGameplayVideo', () => {
  it('returns the first real video, skipping ad slots and Shorts shelves', async () => {
    const html = resultsHtml([
      { adSlotRenderer: { adSlotMetadata: {} } },
      { reelShelfRenderer: { items: [{ reelItemRenderer: { videoId: 'SHORT000001' } }] } },
      video('REALVIDEO01', 'Elden Ring Full Gameplay Walkthrough No Commentary'),
      video('SECONDVID02', 'Elden Ring boss guide'),
    ]);

    const fetchImpl = okFetch(html);
    await expect(searchGameplayVideo('Elden Ring', fetchImpl)).resolves.toEqual({
      status: 'hit',
      videoId: 'REALVIDEO01',
    });
  });

  it('prefers a walkthrough over an earlier trailer via scoring', async () => {
    const html = resultsHtml([
      video('TRAILERVID1', 'Stardew Valley Official Trailer'),
      video('WALKTHRU002', 'Stardew Valley Full Playthrough No Commentary'),
    ]);

    await expect(searchGameplayVideo('Stardew Valley', okFetch(html))).resolves.toEqual({
      status: 'hit',
      videoId: 'WALKTHRU002',
    });
  });

  it('falls back to the first videoId token when the JSON shape is unknown', async () => {
    const html = '<html><body>{"videoId":"FALLBACK123"} more {"videoId":"OTHER999999"}</body></html>';
    await expect(searchGameplayVideo('Whatever', okFetch(html))).resolves.toEqual({
      status: 'hit',
      videoId: 'FALLBACK123',
    });
  });

  it('reports a definitive miss when the page has no video (safe to cache)', async () => {
    await expect(
      searchGameplayVideo('Nothing', okFetch('<html>no videos here</html>')),
    ).resolves.toEqual({ status: 'miss' });
  });

  it('reports an error (not a miss) on a non-ok response so it is not cached', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, text: async () => '' }) as unknown as typeof fetch;
    await expect(searchGameplayVideo('Boom', fetchImpl)).resolves.toEqual({ status: 'error' });
  });

  it('reports an error (never throws) when fetch rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    await expect(searchGameplayVideo('Crash', fetchImpl)).resolves.toEqual({ status: 'error' });
  });

  it('returns a miss for a blank title without fetching', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(searchGameplayVideo('   ', fetchImpl)).resolves.toEqual({ status: 'miss' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
