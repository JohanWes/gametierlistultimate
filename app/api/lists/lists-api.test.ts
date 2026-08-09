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

    expect(shareId).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(url).toContain(`/s/${shareId}`);
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

  it('drops invalid ids and keeps the first S→F placement per game', async () => {
    const malicious = {
      tiers: {
        S: [10, '20', 30, 30, 40, 0, -5, 2.5, Number.MAX_SAFE_INTEGER + 1, 50],
        A: [10, 60, '70', 80, 30],
        B: [],
        C: [],
        D: [],
        E: [],
        F: [90, 60],
      },
      games: [
        { igdbId: 10, title: 'First in S', coverUrl: null },
        { igdbId: '30', title: 'String id', coverUrl: null },
        { igdbId: 0, title: 'Zero id', coverUrl: null },
        { igdbId: -5, title: 'Negative id', coverUrl: null },
        { igdbId: 2.5, title: 'Fraction id', coverUrl: null },
        { igdbId: Number.MAX_SAFE_INTEGER + 1, title: 'Unsafe id', coverUrl: null },
        { igdbId: 60, title: 'In A', coverUrl: null },
        { igdbId: 90, title: 'In F', coverUrl: null },
        { igdbId: 50, title: 'In S', coverUrl: null },
        { igdbId: 80, title: 'In A', coverUrl: null },
      ],
    };

    const created = await POST(postReq(malicious));
    const { shareId } = await created.json();

    const res = await getList(shareId);
    expect(res.status).toBe(200);
    const { list } = await res.json();

    // Valid ordering preserved; first S→F occurrence wins across and within tiers.
    expect(list.tiers.S).toEqual([10, 30, 40, 50]);
    expect(list.tiers.A).toEqual([60, 80]);
    expect(list.tiers.B).toEqual([]);
    expect(list.tiers.C).toEqual([]);
    expect(list.tiers.D).toEqual([]);
    expect(list.tiers.E).toEqual([]);
    expect(list.tiers.F).toEqual([90]);

    // Malformed snapshot ids are dropped from the embedded games.
    expect(list.games.map((g) => g.igdbId)).toEqual([10, 60, 90, 50, 80]);

    const stats = await mongo.db
      .collection(COLLECTIONS.gameStats)
      .find({})
      .sort({ gameId: 1 })
      .toArray();

    // Only accepted ids reach the aggregate, once each, in exactly one tier.
    expect(stats.map((s) => s.gameId)).toEqual([10, 30, 40, 50, 60, 80, 90]);
    for (const s of stats) {
      expect(s.total).toBe(1);
      expect(Object.entries(s.counts).filter(([, count]) => count > 0)).toHaveLength(1);
    }
    expect(stats.find((s) => s.gameId === 10)?.counts).toMatchObject({ S: 1 });
    expect(stats.find((s) => s.gameId === 30)?.counts).toMatchObject({ S: 1 });
    expect(stats.find((s) => s.gameId === 60)?.counts).toMatchObject({ A: 1 });
    expect(stats.find((s) => s.gameId === 80)?.counts).toMatchObject({ A: 1 });
    expect(stats.find((s) => s.gameId === 90)?.counts).toMatchObject({ F: 1 });
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
