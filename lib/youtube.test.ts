import { describe, expect, it } from 'vitest';

import { mockFetch } from '@/test/helpers/fetch';

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

    mockFetch(() => new Response(html));
    await expect(searchGameplayVideo('Elden Ring')).resolves.toEqual({
      status: 'hit',
      videoId: 'REALVIDEO01',
    });
  });

  it('prefers a walkthrough over an earlier trailer via scoring', async () => {
    const html = resultsHtml([
      video('TRAILERVID1', 'Stardew Valley Official Trailer'),
      video('WALKTHRU002', 'Stardew Valley Full Playthrough No Commentary'),
    ]);

    mockFetch(() => new Response(html));
    await expect(searchGameplayVideo('Stardew Valley')).resolves.toEqual({
      status: 'hit',
      videoId: 'WALKTHRU002',
    });
  });

  it('falls back to the first videoId token when the JSON shape is unknown', async () => {
    const html = '<html><body>{"videoId":"FALLBACK123"} more {"videoId":"OTHER999999"}</body></html>';
    mockFetch(() => new Response(html));
    await expect(searchGameplayVideo('Whatever')).resolves.toEqual({
      status: 'hit',
      videoId: 'FALLBACK123',
    });
  });

  it('reports a definitive miss when the page has no video (safe to cache)', async () => {
    mockFetch(() => new Response('<html>no videos here</html>'));
    await expect(searchGameplayVideo('Nothing')).resolves.toEqual({ status: 'miss' });
  });

  it('reports an error (not a miss) on a non-ok response so it is not cached', async () => {
    mockFetch(() => new Response('', { status: 500 }));
    await expect(searchGameplayVideo('Boom')).resolves.toEqual({ status: 'error' });
  });

  it('reports an error (never throws) when fetch rejects', async () => {
    mockFetch(() => {
      throw new Error('network down');
    });
    await expect(searchGameplayVideo('Crash')).resolves.toEqual({ status: 'error' });
  });

  it('returns a miss for a blank title without fetching', async () => {
    const fetchMock = mockFetch();
    await expect(searchGameplayVideo('   ')).resolves.toEqual({ status: 'miss' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
