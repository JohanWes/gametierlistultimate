import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
        body: { prefs: { genres: ['RPG'] }, pool: [1, 2, 3] },
      }),
    );

    const res = await GET(makeReq('GET', { cookie: sessionId }));
    const { session } = await res.json();
    expect(session.sessionId).toBe(sessionId);
    expect(session.prefs).toEqual({ genres: ['RPG'] });
    expect(session.pool).toEqual([1, 2, 3]);
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

    await PUT(makeReq('PUT', { cookie: sessionId, body: { pool: [1, 3] } }));

    expect(
      await mongo.db.collection(COLLECTIONS.gamePoolStats).findOne({ gameId: 2 }),
    ).toMatchObject({ includedCount: 0 });
    expect(
      await mongo.db.collection(COLLECTIONS.gameCooccurrence).findOne({ pairKey: '1:2' }),
    ).toMatchObject({ count: 0 });
    expect(
      await mongo.db.collection(COLLECTIONS.gameCooccurrence).findOne({ pairKey: '1:3' }),
    ).toMatchObject({ count: 1 });
  });

  it('returns null session when no cookie is present', async () => {
    const res = await GET(makeReq('GET'));
    expect(await res.json()).toEqual({ session: null });
  });
});
