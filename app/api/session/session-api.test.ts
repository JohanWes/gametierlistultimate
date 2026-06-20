import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resetStarterGuardrail } from '@/lib/sessions-repo';
import { setResolvedStarterIds } from '@/lib/games/starter-set';
import { COLLECTIONS } from '@/lib/mongo';
import { SESSION_COOKIE } from '@/lib/session';
import { withMemoryMongo, type MemoryMongo } from '@/test/helpers/mongo';

import { GET, POST, PUT } from './route';

let mongo: MemoryMongo;

function makeReq(
  method: string,
  opts: { cookie?: string; body?: unknown } = {},
): NextRequest {
  const req = new NextRequest('http://localhost/api/session', {
    method,
    ...(opts.body !== undefined
      ? { body: JSON.stringify(opts.body), headers: { 'content-type': 'application/json' } }
      : {}),
  });
  if (opts.cookie) req.cookies.set(SESSION_COOKIE, opts.cookie);
  return req;
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

describe('POST /api/session', () => {
  it('issues a cookie and creates a session document', async () => {
    const res = await POST(makeReq('POST'));
    const { sessionId } = await res.json();
    expect(sessionId).toBeTruthy();
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe(sessionId);

    const count = await mongo.db.collection(COLLECTIONS.sessions).countDocuments();
    expect(count).toBe(1);
  });

  it('is idempotent when called again with the same cookie', async () => {
    const first = await POST(makeReq('POST'));
    const { sessionId } = await first.json();

    const second = await POST(makeReq('POST', { cookie: sessionId }));
    expect((await second.json()).sessionId).toBe(sessionId);

    const count = await mongo.db.collection(COLLECTIONS.sessions).countDocuments();
    expect(count).toBe(1); // no duplicate doc
  });
});

describe('PUT + GET /api/session', () => {
  it('persists partial state and reads it back', async () => {
    const created = await POST(makeReq('POST'));
    const { sessionId } = await created.json();

    await PUT(
      makeReq('PUT', {
        cookie: sessionId,
        body: { prefs: { genres: ['RPG'] }, pool: [1, 2, 3], step: 'pool' },
      }),
    );

    const res = await GET(makeReq('GET', { cookie: sessionId }));
    const { session } = await res.json();
    expect(session.sessionId).toBe(sessionId);
    expect(session.prefs).toEqual({ genres: ['RPG'] });
    expect(session.pool).toEqual([1, 2, 3]);
    expect(session.step).toBe('pool');
  });

  it('ignores invalid saved steps', async () => {
    const created = await POST(makeReq('POST'));
    const { sessionId } = await created.json();

    await PUT(makeReq('PUT', { cookie: sessionId, body: { step: 'not-a-step' } }));

    const res = await GET(makeReq('GET', { cookie: sessionId }));
    const { session } = await res.json();
    expect(session.step).toBeUndefined();
  });

  it('updates anonymous pool-pattern aggregates from saved pool changes', async () => {
    const created = await POST(makeReq('POST'));
    const { sessionId } = await created.json();

    await PUT(makeReq('PUT', { cookie: sessionId, body: { pool: [1, 2, 3] } }));

    const stats = await mongo.db
      .collection(COLLECTIONS.gamePoolStats)
      .find({}, { projection: { _id: 0, gameId: 1, includedCount: 1 } })
      .sort({ gameId: 1 })
      .toArray();
    expect(stats).toEqual([
      { gameId: 1, includedCount: 1 },
      { gameId: 2, includedCount: 1 },
      { gameId: 3, includedCount: 1 },
    ]);

    expect(
      await mongo.db.collection(COLLECTIONS.gameCooccurrence).findOne({ pairKey: '1:2' }),
    ).toMatchObject({ gameA: 1, gameB: 2, count: 1 });
    expect(
      await mongo.db.collection(COLLECTIONS.gameCooccurrence).findOne({ pairKey: '1:3' }),
    ).toMatchObject({ gameA: 1, gameB: 3, count: 1 });

    // Shrinking below the MIN_POOL_SIZE threshold removes all previous contributions,
    // and the guard deletes the decayed docs instead of leaving them at count 0.
    await PUT(makeReq('PUT', { cookie: sessionId, body: { pool: [1, 3] } }));

    expect(
      await mongo.db.collection(COLLECTIONS.gamePoolStats).findOne({ gameId: 2 }),
    ).toBeNull();
    expect(
      await mongo.db.collection(COLLECTIONS.gameCooccurrence).findOne({ pairKey: '1:2' }),
    ).toBeNull();
    expect(
      await mongo.db.collection(COLLECTIONS.gameCooccurrence).findOne({ pairKey: '1:3' }),
    ).toBeNull();
    expect(
      await mongo.db.collection(COLLECTIONS.gamePoolStats).findOne({ gameId: 1 }),
    ).toBeNull();
  });

  it('skips pool-pattern aggregates for pools below the minimum size', async () => {
    const created = await POST(makeReq('POST'));
    const { sessionId } = await created.json();

    // A 2-game pool is below the threshold — nothing should be recorded.
    await PUT(makeReq('PUT', { cookie: sessionId, body: { pool: [1, 2] } }));
    expect(await mongo.db.collection(COLLECTIONS.gamePoolStats).countDocuments()).toBe(0);
    expect(await mongo.db.collection(COLLECTIONS.gameCooccurrence).countDocuments()).toBe(0);

    // Growing to 3 games crosses the threshold — the full pool is recorded.
    await PUT(makeReq('PUT', { cookie: sessionId, body: { pool: [1, 2, 3] } }));
    expect(
      await mongo.db.collection(COLLECTIONS.gamePoolStats).countDocuments(),
    ).toBe(3);
    expect(
      await mongo.db.collection(COLLECTIONS.gameCooccurrence).countDocuments(),
    ).toBe(3);
  });

  it('excludes starter-set ids from pool-pattern aggregates (predictor guardrail)', async () => {
    // Pre-populate the starter id cache: ids 1 and 2 are "starter" games, id 3 is not.
    // This simulates the suggestions API having resolved the starter shelf.
    setResolvedStarterIds([1, 2]);

    const created = await POST(makeReq('POST'));
    const { sessionId } = await created.json();

    // Save a pool containing both starter (1,2) and non-starter (3,4,5) ids.
    await PUT(makeReq('PUT', { cookie: sessionId, body: { pool: [1, 2, 3, 4, 5] } }));

    // Only the non-starter ids (3,4,5) should be recorded in gamePoolStats.
    const stats = await mongo.db
      .collection(COLLECTIONS.gamePoolStats)
      .find({}, { projection: { _id: 0, gameId: 1 } })
      .sort({ gameId: 1 })
      .toArray();
    expect(stats.map((s) => s.gameId)).toEqual([3, 4, 5]);

    // Only the non-starter pair (3:4, 3:5, 4:5) should be recorded in gameCooccurrence.
    const coocKeys = await mongo.db
      .collection(COLLECTIONS.gameCooccurrence)
      .find({}, { projection: { _id: 0, pairKey: 1 } })
      .sort({ pairKey: 1 })
      .toArray();
    expect(coocKeys.map((c) => c.pairKey).sort()).toEqual(['3:4', '3:5', '4:5']);

    // No starter id should appear in any co-occurrence edge.
    for (const key of coocKeys.map((c) => c.pairKey)) {
      const [a, b] = key.split(':').map(Number);
      expect([a, b]).not.toContain(1);
      expect([a, b]).not.toContain(2);
    }
  });

  it('returns null session when no cookie is present', async () => {
    const res = await GET(makeReq('GET'));
    expect(await res.json()).toEqual({ session: null });
  });
});
