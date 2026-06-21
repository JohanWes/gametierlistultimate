import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { COLLECTIONS } from '@/lib/mongo';
import { resetStarterGuardrail } from '@/lib/pool-stats-service';
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

async function poolStatsCount() {
  return mongo.db.collection(COLLECTIONS.gamePoolStats).countDocuments();
}
async function cooccurrenceCount() {
  return mongo.db.collection(COLLECTIONS.gameCooccurrence).countDocuments();
}

beforeAll(async () => {
  mongo = await withMemoryMongo();
});
afterAll(async () => {
  await mongo.teardown();
});
beforeEach(async () => {
  await mongo.clear();
  resetStarterGuardrail();
});

describe('POST /api/pool-stats', () => {
  it('records a new pool into the co-occurrence aggregates', async () => {
    const res = await POST(postReq({ previous: [], next: [10, 20, 30] }));
    expect(await res.json()).toEqual({ ok: true });

    expect(await poolStatsCount()).toBe(3); // one per game
    expect(await cooccurrenceCount()).toBe(3); // 3 choose 2 pairs
  });

  it('ignores pools below the minimum size', async () => {
    await POST(postReq({ previous: [], next: [10, 20] }));
    expect(await poolStatsCount()).toBe(0);
    expect(await cooccurrenceCount()).toBe(0);
  });

  it('removes contributions when a pool shrinks below the threshold', async () => {
    await POST(postReq({ previous: [], next: [10, 20, 30] }));
    await POST(postReq({ previous: [10, 20, 30], next: [10, 20] }));
    expect(await poolStatsCount()).toBe(0);
    expect(await cooccurrenceCount()).toBe(0);
  });

  it('filters curated starter-set ids out of the aggregates', async () => {
    // Seed a games doc that resolves as a starter game (matched by title in getStarterSet).
    await mongo.db.collection(COLLECTIONS.games).insertOne({
      id: 999,
      name: 'Elden Ring',
      genre: 'RPG',
      platform: 'PC',
      rating: 95,
      cover: 'https://img/999.jpg',
    });

    await POST(postReq({ previous: [], next: [999, 20, 30, 40] }));

    const ids = (
      await mongo.db
        .collection(COLLECTIONS.gamePoolStats)
        .find({}, { projection: { _id: 0, gameId: 1 } })
        .toArray()
    ).map((d) => d.gameId);
    expect(ids).not.toContain(999);
    expect(ids).toEqual(expect.arrayContaining([20, 30, 40]));
  });
});
