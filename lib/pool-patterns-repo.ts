import { COLLECTIONS, getDb } from './mongo';

export interface GamePoolStatsDoc {
  gameId: number;
  includedCount: number;
  updatedAt: Date;
}

export interface GameCooccurrenceDoc {
  pairKey: string;
  gameA: number;
  gameB: number;
  count: number;
  updatedAt: Date;
}

async function poolStatsCollection() {
  return (await getDb()).collection<GamePoolStatsDoc>(COLLECTIONS.gamePoolStats);
}

async function cooccurrenceCollection() {
  return (await getDb()).collection<GameCooccurrenceDoc>(COLLECTIONS.gameCooccurrence);
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
 * Update anonymous pool-pattern aggregates from an autosaved session-pool delta.
 * The aggregate stores counts only, while the session document remains the only
 * place that knows which games belong to a specific anonymous restore state.
 *
 * Pools below MIN_POOL_SIZE are never recorded. If a pool shrinks below the
 * threshold, all of its previous contributions are removed. Docs that decay to
 * zero or below are deleted so the collections stay lean and the reader (which
 * filters `count > 0`) doesn't scan dead entries.
 */
export async function updatePoolPatternAggregates(previousPool: unknown, nextPool: unknown) {
  const previous = cleanIds(previousPool);
  const next = cleanIds(nextPool);

  const previousRecorded = previous.length >= MIN_POOL_SIZE;
  const nextRecorded = next.length >= MIN_POOL_SIZE;

  // Neither pool meets the threshold — nothing to add or remove.
  if (!previousRecorded && !nextRecorded) return;

  const now = new Date();
  const previousIds = new Set(previous);
  const nextIds = new Set(next);

  let statsAdded: number[];
  let statsRemoved: number[];
  let pairsAdded: Set<string>;
  let pairsRemoved: Set<string>;

  if (nextRecorded && previousRecorded) {
    // Both meet threshold — process the diff.
    statsAdded = next.filter((id) => !previousIds.has(id));
    statsRemoved = previous.filter((id) => !nextIds.has(id));
    const prevPairs = pairSet(previous);
    const nextPairs = pairSet(next);
    pairsAdded = new Set([...nextPairs].filter((key) => !prevPairs.has(key)));
    pairsRemoved = new Set([...prevPairs].filter((key) => !nextPairs.has(key)));
  } else if (nextRecorded) {
    // Previous was below threshold (never recorded) — add everything in the new pool.
    statsAdded = [...next];
    statsRemoved = [];
    pairsAdded = pairSet(next);
    pairsRemoved = new Set();
  } else {
    // Next is below threshold but previous was recorded — remove all previous contributions.
    statsAdded = [];
    statsRemoved = [...previous];
    pairsAdded = new Set();
    pairsRemoved = pairSet(previous);
  }

  const statsOps = [
    ...statsAdded.map((gameId) => ({
      updateOne: {
        filter: { gameId },
        update: { $inc: { includedCount: 1 }, $set: { updatedAt: now } },
        upsert: true,
      },
    })),
    ...statsRemoved.map((gameId) => ({
      updateOne: {
        filter: { gameId },
        update: { $inc: { includedCount: -1 }, $set: { updatedAt: now } },
        upsert: true,
      },
    })),
  ];

  const pairOps = [
    ...[...pairsAdded].map((key) => {
      const [gameA, gameB] = parsePair(key);
      return {
        updateOne: {
          filter: { pairKey: key },
          update: { $inc: { count: 1 }, $set: { gameA, gameB, updatedAt: now } },
          upsert: true,
        },
      };
    }),
    ...[...pairsRemoved].map((key) => {
      const [gameA, gameB] = parsePair(key);
      return {
        updateOne: {
          filter: { pairKey: key },
          update: { $inc: { count: -1 }, $set: { gameA, gameB, updatedAt: now } },
          upsert: true,
        },
      };
    }),
  ];

  const stats = await poolStatsCollection();
  const cooccurrence = await cooccurrenceCollection();
  await Promise.all([
    statsOps.length ? stats.bulkWrite(statsOps) : Promise.resolve(),
    pairOps.length ? cooccurrence.bulkWrite(pairOps) : Promise.resolve(),
  ]);

  // Delete any docs that have decayed to zero or below so the collections stay lean
  // and the reader (which filters count > 0) doesn't scan dead entries.
  await Promise.all([
    stats.deleteMany({ includedCount: { $lte: 0 } }),
    cooccurrence.deleteMany({ count: { $lte: 0 } }),
  ]);
}

/** Sum co-occurrence edge counts from the current session seeds to every candidate game. */
export async function getCooccurrenceScores(seedIds: number[]): Promise<Map<number, number>> {
  const seeds = cleanIds(seedIds);
  if (seeds.length === 0) return new Map();

  const coll = await cooccurrenceCollection();
  const docs = await coll
    .find({
      count: { $gt: 0 },
      $or: [{ gameA: { $in: seeds } }, { gameB: { $in: seeds } }],
    })
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
