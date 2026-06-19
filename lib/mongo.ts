import { MongoClient, type Db } from 'mongodb';

import { getEnv } from './env';

/**
 * Cached MongoDB client using the serverless-safe "cached promise" pattern: a single
 * connection promise is memoized on `globalThis` so warm serverless invocations (and
 * Next.js HMR in dev) reuse one client instead of opening a connection per request.
 *
 * Tests point this at an in-memory server via {@link setMongoUriOverride} +
 * {@link resetMongo} (see test/helpers/mongo.ts).
 */

interface MongoCache {
  client: MongoClient | null;
  promise: Promise<MongoClient> | null;
  uriOverride: string | null;
}

const globalForMongo = globalThis as typeof globalThis & {
  __mongoCache?: MongoCache;
};

const cache: MongoCache = (globalForMongo.__mongoCache ??= {
  client: null,
  promise: null,
  uriOverride: null,
});

/** Default database name; can be overridden with the MONGODB_DB env var. */
export const DEFAULT_DB_NAME = process.env.MONGODB_DB?.trim() || 'guessthegame';

/** Collection names used across the app. */
export const COLLECTIONS = {
  games: 'games',
  sessions: 'sessions',
  lists: 'lists',
  gameStats: 'gameStats',
  gamePoolStats: 'gamePoolStats',
  gameCooccurrence: 'gameCooccurrence',
} as const;

function resolveUri(): string {
  return cache.uriOverride ?? getEnv().MONGODB_URI;
}

/** Returns a connected MongoClient, reusing the cached connection when possible. */
export async function getClient(): Promise<MongoClient> {
  if (cache.client) return cache.client;
  if (!cache.promise) {
    const client = new MongoClient(resolveUri());
    cache.promise = client.connect().then((connected) => {
      cache.client = connected;
      return connected;
    });
  }
  return cache.promise;
}

/** Returns the application database (or a named database when provided). */
export async function getDb(name: string = DEFAULT_DB_NAME): Promise<Db> {
  const client = await getClient();
  return client.db(name);
}

/**
 * Test helper: force the next connection to use the given URI (e.g. an in-memory server).
 * Call {@link resetMongo} first to drop any existing cached client.
 */
export function setMongoUriOverride(uri: string | null): void {
  cache.uriOverride = uri;
}

/** Test helper: close and clear the cached client so the next call reconnects fresh. */
export async function resetMongo(): Promise<void> {
  if (cache.client) {
    await cache.client.close().catch(() => {});
  }
  cache.client = null;
  cache.promise = null;
}
