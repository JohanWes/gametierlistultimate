import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { STARTER_IDS } from '@/lib/games/starter-set';
import { COLLECTIONS } from '@/lib/mongo';
import { withMemoryMongo, type MemoryMongo } from '@/test/helpers/mongo';

import { POST } from './route';

let mongo: MemoryMongo;

function postReq(body: unknown) {
  return new NextRequest('http://localhost/api/pool-stats', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

async function pairs() {
  return mongo.db
    .collection(COLLECTIONS.gameCooccurrence)
    .find({}, { projection: { _id: 0, pairKey: 1, count: 1 } })
    .sort({ pairKey: 1 })
    .toArray();
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

describe('POST /api/pool-stats', () => {
  it('records a new pool into the co-occurrence aggregates', async () => {
    const res = await POST(postReq({ previous: [], next: [10, 20, 30] }));
    expect(await res.json()).toEqual({ ok: true });

    expect((await pairs()).map((p) => p.pairKey)).toEqual(['10:20', '10:30', '20:30']);
  });

  it('ignores pools below the minimum size', async () => {
    await POST(postReq({ previous: [], next: [10, 20] }));
    expect(await pairs()).toEqual([]);
  });

  it('removes contributions when a pool shrinks below the threshold', async () => {
    await POST(postReq({ previous: [], next: [10, 20, 30] }));
    await POST(postReq({ previous: [10, 20, 30], next: [10, 20] }));
    expect(await pairs()).toEqual([]);
  });

  it('filters curated starter-set ids out of the aggregates', async () => {
    const [starterId] = STARTER_IDS;
    await POST(postReq({ previous: [], next: [starterId, 20, 30, 40] }));

    expect((await pairs()).map((p) => p.pairKey)).toEqual(['20:30', '20:40', '30:40']);
  });
});

describe('concurrent writes', () => {
  it('sums identical concurrent pool updates into one identity document each', async () => {
    const runs = 4;
    const results = await Promise.all(
      Array.from({ length: runs }, () => POST(postReq({ previous: [], next: [10, 20, 30] }))),
    );
    for (const res of results) {
      expect(await res.json()).toEqual({ ok: true });
    }

    // One identity document per pair with every run summed — no duplicates from the race.
    const docs = await pairs();
    expect(docs.map((p) => p.pairKey)).toEqual(['10:20', '10:30', '20:30']);
    for (const p of docs) {
      expect(p.count).toBe(runs);
    }
  });
});
