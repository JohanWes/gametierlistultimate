import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetStarterSetCache } from '@/lib/games/repo';
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
  resetStarterSetCache(); // tests re-seed games; drop the memoized starter shelf so it re-resolves
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

describe('unique indexes', () => {
  it('awaits index creation on gamePoolStats and gameCooccurrence before writing', async () => {
    // Exercise the write path — the memoized index promises must be awaited before any upsert.
    const res = await POST(postReq({ previous: [], next: [10, 20, 30] }));
    expect(await res.json()).toEqual({ ok: true });

    const statsIndexes = await mongo.db
      .collection(COLLECTIONS.gamePoolStats)
      .listIndexes()
      .toArray();
    const gameIdIndex = statsIndexes.find((i) => i.name === 'gameId_unique');
    expect(gameIdIndex?.key).toEqual({ gameId: 1 });
    expect(gameIdIndex?.unique).toBe(true);

    const pairIndexes = await mongo.db
      .collection(COLLECTIONS.gameCooccurrence)
      .listIndexes()
      .toArray();
    const pairKeyIndex = pairIndexes.find((i) => i.name === 'pairKey_unique');
    expect(pairKeyIndex?.key).toEqual({ pairKey: 1 });
    expect(pairKeyIndex?.unique).toBe(true);

    const gameAIndex = pairIndexes.find((i) => i.name === 'gameA_idx');
    expect(gameAIndex?.key).toEqual({ gameA: 1 });
    expect(gameAIndex?.unique).not.toBe(true);

    const gameBIndex = pairIndexes.find((i) => i.name === 'gameB_idx');
    expect(gameBIndex?.key).toEqual({ gameB: 1 });
    expect(gameBIndex?.unique).not.toBe(true);
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

    // One identity document per game with every run summed — no duplicates from the race.
    const stats = await mongo.db
      .collection(COLLECTIONS.gamePoolStats)
      .find({}, { projection: { _id: 0, gameId: 1, includedCount: 1 } })
      .sort({ gameId: 1 })
      .toArray();
    expect(stats.map((s) => s.gameId)).toEqual([10, 20, 30]);
    for (const s of stats) {
      expect(s.includedCount).toBe(runs);
    }

    const pairs = await mongo.db
      .collection(COLLECTIONS.gameCooccurrence)
      .find({}, { projection: { _id: 0, pairKey: 1, count: 1 } })
      .sort({ pairKey: 1 })
      .toArray();
    expect(pairs.map((p) => p.pairKey)).toEqual(['10:20', '10:30', '20:30']);
    for (const p of pairs) {
      expect(p.count).toBe(runs);
    }
  });
});
