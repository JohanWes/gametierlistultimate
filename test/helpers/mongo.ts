import { MongoMemoryServer } from 'mongodb-memory-server';

import { DEFAULT_DB_NAME, getDb, resetMongo, setMongoUriOverride } from '@/lib/mongo';

export interface MemoryMongo {
  /** The running in-memory server instance. */
  server: MongoMemoryServer;
  /** Convenience accessor for the app database (DEFAULT_DB_NAME). */
  db: Awaited<ReturnType<typeof getDb>>;
  /** Drop all collections between tests without paying the spin-up cost again. */
  clear: () => Promise<void>;
  /** Stop the server and reset the cached Mongo client. */
  teardown: () => Promise<void>;
}

/**
 * Spin up an in-memory MongoDB, point the shared `lib/mongo` singleton at it, and return
 * helpers for use in `beforeAll`/`afterAll`. Real DB credentials are never touched.
 */
export async function withMemoryMongo(): Promise<MemoryMongo> {
  const server = await MongoMemoryServer.create();
  await resetMongo();
  setMongoUriOverride(server.getUri());

  const db = await getDb(DEFAULT_DB_NAME);

  return {
    server,
    db,
    async clear() {
      const collections = await db.collections();
      await Promise.all(collections.map((c) => c.deleteMany({})));
    },
    async teardown() {
      await resetMongo();
      setMongoUriOverride(null);
      await server.stop();
    },
  };
}
