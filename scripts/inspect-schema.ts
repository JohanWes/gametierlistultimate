/**
 * One-off, manually-run helper to inspect the real MongoDB so the Game normalizer can be
 * written against actual field names rather than assumptions. NOT part of the test path.
 *
 *   npm run inspect:schema
 *
 * Reads MONGODB_URI from .env (loaded via dotenv). Prints each database/collection with its
 * document count and the top-level field keys of one sample doc. Collections whose docs have
 * an unreasonable number of keys (keyed-map style, e.g. an id→value lookup) are summarised
 * only, and a compact sample of the games collection is printed for normalizer design.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

import { getEnv } from '../lib/env';

function shorten(value: unknown, max = 120): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (s == null) return String(value);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

async function main() {
  const { MONGODB_URI } = getEnv();
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  try {
    const { databases } = await client.db().admin().listDatabases();

    for (const { name } of databases) {
      if (['admin', 'local', 'config'].includes(name)) continue;
      const db = client.db(name);
      const collections = await db.listCollections().toArray();
      console.log(`\n=== DATABASE: ${name} ===`);

      for (const { name: collName } of collections) {
        const coll = db.collection(collName);
        const count = await coll.estimatedDocumentCount();
        const sample = await coll.findOne({});
        const keys = sample ? Object.keys(sample) : [];
        console.log(`\n  ${collName}: ~${count} docs, ${keys.length} top-level keys`);

        if (keys.length > 60) {
          console.log('    (keyed-map style collection — keys omitted)');
          continue;
        }
        for (const k of keys) {
          console.log(`    ${k}: ${shorten((sample as Record<string, unknown>)[k])}`);
        }
      }
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
