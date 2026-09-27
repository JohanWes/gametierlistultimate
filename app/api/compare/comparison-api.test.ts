import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createList, type ListInput } from '@/lib/lists-repo';
import { withMemoryMongo, type MemoryMongo } from '@/test/helpers/mongo';

import { POST } from './route';

let mongo: MemoryMongo;

const emptyTiers = { S: [], A: [], B: [], C: [], D: [], E: [], F: [] };

/** Publish a list placing `gameId` into `tier` (other games optional). */
function listWith(tier: keyof typeof emptyTiers, ids: number[]): ListInput {
  return {
    tiers: { ...emptyTiers, [tier]: ids },
    games: ids.map((id) => ({ igdbId: id, title: `Game ${id}`, coverUrl: null })),
  } as ListInput;
}

function compareReq(body: unknown) {
  return new NextRequest('http://localhost/api/compare', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
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

describe('POST /api/compare (pre-publish owner)', () => {
  it('returns high similarity when the user agrees with the crowd', async () => {
    // Five lists put game 1 at S.
    for (let i = 0; i < 5; i += 1) await createList(listWith('S', [1]));

    const res = await POST(compareReq({ tiers: { ...emptyTiers, S: [1] } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.similarityPercent).toBe(100);
    expect(data.sampleSize).toBe(5);
    expect(data.outliers).toHaveLength(0);
  });

  it('returns low similarity and an outlier when the user disagrees', async () => {
    for (let i = 0; i < 5; i += 1) await createList(listWith('S', [1]));

    const res = await POST(compareReq({ tiers: { ...emptyTiers, F: [1] } }));
    const data = await res.json();
    expect(data.similarityPercent).toBe(0);
    expect(data.outliers[0]).toMatchObject({
      gameId: 1,
      userTier: 'F',
      communityTier: 'S',
      direction: 'lower',
    });
  });

  it('rejects an invalid body', async () => {
    const res = await POST(compareReq({ nope: true }));
    expect(res.status).toBe(400);
  });

  it('degrades gracefully with no community data', async () => {
    const res = await POST(compareReq({ tiers: { ...emptyTiers, S: [1] } }));
    const data = await res.json();
    expect(data.similarityPercent).toBeNull();
    expect(data.outliers).toEqual([]);
    expect(data.sampleSize).toBe(0);
  });
});
