import { COLLECTIONS, getDb } from './mongo';

export interface GameCooccurrenceDoc {
  pairKey: string;
  gameA: number;
  gameB: number;
  count: number;
  updatedAt: Date;
}

/**
 * Memoized index creation for the `gameCooccurrence` collection: the unique `pairKey` identity
 * plus the `gameA`/`gameB` read indexes. A rejection resets the promise so the next access
 * retries.
 */
let cooccurrenceIndexesPromise: Promise<string[]> | null = null;

async function cooccurrenceCollection() {
  const coll = (await getDb()).collection<GameCooccurrenceDoc>(COLLECTIONS.gameCooccurrence);
  if (!cooccurrenceIndexesPromise) {
    cooccurrenceIndexesPromise = Promise.all([
      coll.createIndex({ pairKey: 1 }, { unique: true, name: 'pairKey_unique' }),
      coll.createIndex({ gameA: 1 }, { name: 'gameA_idx' }),
      coll.createIndex({ gameB: 1 }, { name: 'gameB_idx' }),
    ]).catch((err) => {
      cooccurrenceIndexesPromise = null;
      throw err;
    });
  }
  await cooccurrenceIndexesPromise;
  return coll;
}

function cleanIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
}

export function pairKey(a: number, b: number): string {
  const [gameA, gameB] = a < b ? [a, b] : [b, a];
  return `${gameA}:${gameB}`;
}

function pairSet(ids: number[]): Set<string> {
  const pairs = new Set<string>();
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      pairs.add(pairKey(ids[i], ids[j]));
    }
  }
  return pairs;
}

function parsePair(key: string): [number, number] {
  const [a, b] = key.split(':').map(Number);
  return [a, b];
}

/**
 * Minimum pool size for co-occurrence aggregates to be meaningful. Pools with fewer
 * games than this are skipped entirely — they don't produce enough pairwise signal,
 * and tiny pools from abandoned sessions pollute the aggregate with noise that later
 * decays to zero/negative counts. This is the root-cause guard against stale data.
 */
const MIN_POOL_SIZE = 3;

/**
 * Update the anonymous co-occurrence aggregate from a previous→next pool delta. Pools below
 * MIN_POOL_SIZE are never recorded; if a pool shrinks below the threshold, all of its previous
 * contributions are removed. Pairs that decay to zero are deleted so the reader (which filters
 * `count > 0`) doesn't scan dead entries.
 */
export async function updatePoolPatternAggregates(previousPool: unknown, nextPool: unknown) {
  const previous = cleanIds(previousPool);
  const next = cleanIds(nextPool);
  const prevPairs = previous.length >= MIN_POOL_SIZE ? pairSet(previous) : new Set<string>();
  const nextPairs = next.length >= MIN_POOL_SIZE ? pairSet(next) : new Set<string>();
  const pairsAdded = [...nextPairs].filter((key) => !prevPairs.has(key));
  const pairsRemoved = [...prevPairs].filter((key) => !nextPairs.has(key));
  if (pairsAdded.length === 0 && pairsRemoved.length === 0) return;

  const now = new Date();
  const cooccurrence = await cooccurrenceCollection();
  await cooccurrence.bulkWrite([
    ...pairsAdded.map((key) => {
      const [gameA, gameB] = parsePair(key);
      return {
        updateOne: {
          filter: { pairKey: key },
          update: { $inc: { count: 1 }, $set: { gameA, gameB, updatedAt: now } },
          upsert: true,
        },
      };
    }),
    // Decrements never upsert, so a pair that was never counted can't become a negative doc.
    ...pairsRemoved.map((key) => ({
      updateOne: {
        filter: { pairKey: key },
        update: { $inc: { count: -1 }, $set: { updatedAt: now } },
        upsert: false,
      },
    })),
  ]);

  if (pairsRemoved.length) {
    await cooccurrence.deleteMany({ pairKey: { $in: pairsRemoved }, count: { $lte: 0 } });
  }
}

/** Sum co-occurrence edge counts from the current session seeds to every candidate game. */
export async function getCooccurrenceScores(seedIds: number[]): Promise<Map<number, number>> {
  const seeds = cleanIds(seedIds);
  if (seeds.length === 0) return new Map();

  const coll = await cooccurrenceCollection();
  const docs = await coll
    .find(
      {
        count: { $gt: 0 },
        $or: [{ gameA: { $in: seeds } }, { gameB: { $in: seeds } }],
      },
      { projection: { _id: 0, gameA: 1, gameB: 1, count: 1 } },
    )
    .toArray();

  const seedSet = new Set(seeds);
  const scores = new Map<number, number>();
  for (const doc of docs) {
    const other = seedSet.has(doc.gameA) ? doc.gameB : seedSet.has(doc.gameB) ? doc.gameA : null;
    if (other == null || seedSet.has(other)) continue;
    scores.set(other, (scores.get(other) ?? 0) + doc.count);
  }
  return scores;
}
