import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '@/lib/mongo';
import { mswServer } from '@/test/helpers/msw';
import { withMemoryMongo, type MemoryMongo } from '@/test/helpers/mongo';

import { GET } from './route';

let mongo: MemoryMongo;

/** A YouTube results page whose first real video has the given id. */
function resultsHtml(videoId: string, title = 'Full Gameplay Walkthrough No Commentary'): string {
  const data = {
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: {
          sectionListRenderer: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [{ videoRenderer: { videoId, title: { runs: [{ text: title }] } } }],
                },
              },
            ],
          },
        },
      },
    },
  };
  return `<script>var ytInitialData = ${JSON.stringify(data)};</script>`;
}

/** Stub the YouTube results page; returns a counter of how many times it was hit. */
function stubYouTube(html: string) {
  const calls = { count: 0 };
  mswServer.use(
    http.get('https://www.youtube.com/results', () => {
      calls.count += 1;
      return new HttpResponse(html, { headers: { 'content-type': 'text/html' } });
    }),
  );
  return calls;
}

function getVideo(igdbId: string) {
  return GET(new Request(`http://localhost/api/games/${igdbId}/video`), {
    params: Promise.resolve({ igdbId }),
  });
}

async function seedGame(id: number, name: string) {
  await mongo.db.collection(COLLECTIONS.games).insertOne({ id, name, cover: `https://img/${id}.jpg` });
}

beforeAll(async () => {
  mongo = await withMemoryMongo();
});
afterAll(async () => {
  await mongo.teardown();
});
beforeEach(async () => {
  await mongo.clear();
});

describe('GET /api/games/:igdbId/video', () => {
  it('rejects a non-numeric / non-positive id with 400', async () => {
    expect((await getVideo('abc')).status).toBe(400);
    expect((await getVideo('0')).status).toBe(400);
    expect((await getVideo('-5')).status).toBe(400);
  });

  it('returns 404 for an unknown game', async () => {
    const res = await getVideo('999');
    expect(res.status).toBe(404);
  });

  it('resolves, returns the videoId, and caches it on the game doc', async () => {
    await seedGame(42, 'Hollow Knight');
    const calls = stubYouTube(resultsHtml('HKVIDEO0001'));

    const res = await getVideo('42');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ videoId: 'HKVIDEO0001' });
    expect(calls.count).toBe(1);

    const doc = await mongo.db.collection(COLLECTIONS.games).findOne({ id: 42 });
    expect(doc?.youtubeVideoId).toBe('HKVIDEO0001');
    expect(doc?.youtubeResolveStatus).toBe('hit');
  });

  it('serves a cached hit without hitting YouTube again', async () => {
    await seedGame(7, 'Celeste');
    const calls = stubYouTube(resultsHtml('CELESTE0001'));

    await getVideo('7');
    const second = await getVideo('7');

    expect(await second.json()).toEqual({ videoId: 'CELESTE0001' });
    expect(calls.count).toBe(1); // second call short-circuited on the cache
  });

  it('caches a miss and serves null without re-scraping', async () => {
    await seedGame(8, 'Obscure Game');
    const calls = stubYouTube('<html>no videos</html>');

    const first = await getVideo('8');
    expect(await first.json()).toEqual({ videoId: null });

    const second = await getVideo('8');
    expect(await second.json()).toEqual({ videoId: null });
    expect(calls.count).toBe(1); // fresh miss is not re-scraped

    const doc = await mongo.db.collection(COLLECTIONS.games).findOne({ id: 8 });
    expect(doc?.youtubeResolveStatus).toBe('miss');
    expect(doc?.youtubeVideoId).toBeNull();
  });

  it('searches by the stored title — a request body/param cannot poison the cache', async () => {
    await seedGame(99, 'Real Game Title');
    let capturedQuery: string | null = null;
    mswServer.use(
      http.get('https://www.youtube.com/results', ({ request }) => {
        capturedQuery = new URL(request.url).searchParams.get('search_query');
        return new HttpResponse(resultsHtml('VID00000001'), {
          headers: { 'content-type': 'text/html' },
        });
      }),
    );

    // The route ignores any client-supplied title; it always searches by the doc's own name.
    await GET(new Request('http://localhost/api/games/99/video?title=Malicious+Injection'), {
      params: Promise.resolve({ igdbId: '99' }),
    });

    expect(capturedQuery).toBe('Real Game Title full gameplay walkthrough');
  });

  it('does not cache a transient upstream failure — the next click retries', async () => {
    await seedGame(11, 'Flaky Game');
    let hits = 0;
    mswServer.use(
      http.get('https://www.youtube.com/results', () => {
        hits += 1;
        // First request fails (e.g. YouTube 503 / captcha), second succeeds.
        if (hits === 1) return new HttpResponse('', { status: 503 });
        return new HttpResponse(resultsHtml('RECOVERED01'), {
          headers: { 'content-type': 'text/html' },
        });
      }),
    );

    const first = await getVideo('11');
    expect(await first.json()).toEqual({ videoId: null });
    // The failure was NOT written to Mongo, so the game is still unresolved.
    const afterFail = await mongo.db.collection(COLLECTIONS.games).findOne({ id: 11 });
    expect(afterFail?.youtubeResolveStatus).toBeUndefined();

    const second = await getVideo('11');
    expect(await second.json()).toEqual({ videoId: 'RECOVERED01' });
    expect(hits).toBe(2); // retried instead of being stuck on a cached miss
  });
});
