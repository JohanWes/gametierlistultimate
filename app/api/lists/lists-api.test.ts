import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '@/lib/mongo';
import { withMemoryMongo, type MemoryMongo } from '@/test/helpers/mongo';

import { POST } from './route';
import { GET } from './[shareId]/route';

let mongo: MemoryMongo;

const payload = {
  tiers: { S: [1], A: [2, 3], B: [], C: [], D: [], E: [], F: [4] },
  games: [
    { igdbId: 1, title: 'The Witcher 3', coverUrl: 'https://img/1.jpg' },
    { igdbId: 2, title: 'Halo', coverUrl: 'https://img/2.jpg' },
    { igdbId: 3, title: 'Portal', coverUrl: 'https://img/3.jpg' },
    { igdbId: 4, title: 'FIFA', coverUrl: 'https://img/4.jpg' },
  ],
};

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/lists', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function getList(shareId: string) {
  return GET(new Request(`http://localhost/api/lists/${shareId}`), {
    params: Promise.resolve({ shareId }),
  });
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

describe('POST /api/lists', () => {
  it('stores a snapshot and returns a short shareId + url', async () => {
    const res = await POST(postReq(payload));
    expect(res.status).toBe(201);
    const { shareId, url } = await res.json();

    expect(shareId).toMatch(/^[\w-]{6,}$/);
    expect(url).toContain(`/list/${shareId}`);
  });

  it('rejects an invalid body', async () => {
    const res = await POST(postReq({ games: [] }));
    expect(res.status).toBe(400);
  });

  it('increments gameStats per placed game with no session identifier', async () => {
    const res = await POST(postReq(payload));
    const { shareId } = await res.json();

    const stats = await mongo.db
      .collection(COLLECTIONS.gameStats)
      .find({})
      .sort({ gameId: 1 })
      .toArray();

    // Four placed games → four stats docs.
    expect(stats.map((s) => s.gameId)).toEqual([1, 2, 3, 4]);
    expect(stats.find((s) => s.gameId === 1)?.counts.S).toBe(1);
    expect(stats.find((s) => s.gameId === 2)?.counts.A).toBe(1);
    expect(stats.find((s) => s.gameId === 4)?.counts.F).toBe(1);

    // No session identifier leaked into the aggregate.
    for (const s of stats) {
      expect(s).not.toHaveProperty('sessionId');
    }
    expect(shareId).toBeTruthy();
  });

  it('accumulates counts across multiple publishes', async () => {
    await POST(postReq(payload));
    await POST(postReq(payload));
    const stat1 = await mongo.db.collection(COLLECTIONS.gameStats).findOne({ gameId: 1 });
    expect(stat1?.counts.S).toBe(2);
    expect(stat1?.total).toBe(2);
  });
});

describe('GET /api/lists/:shareId', () => {
  it('returns the self-contained snapshot', async () => {
    const created = await POST(postReq(payload));
    const { shareId } = await created.json();

    const res = await getList(shareId);
    expect(res.status).toBe(200);
    const { list } = await res.json();

    expect(list.shareId).toBe(shareId);
    expect(list.tiers.S).toEqual([1]);
    expect(list.tiers.A).toEqual([2, 3]);
    // Covers/titles are embedded so the share view needs no extra lookups.
    expect(list.games).toHaveLength(4);
    expect(list.games[0]).toMatchObject({ igdbId: 1, title: 'The Witcher 3' });
  });

  it('returns 404 for an unknown shareId', async () => {
    const res = await getList('does-not-exist');
    expect(res.status).toBe(404);
  });
});
