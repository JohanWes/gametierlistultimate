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
 * Update anonymous pool-pattern aggregates from an autosaved session-pool delta.
 * The aggregate stores counts only, while the session document remains the only
 * place that knows which games belong to a specific anonymous restore state.
 */
export async function updatePoolPatternAggregates(previousPool: unknown, nextPool: unknown) {
  const previous = cleanIds(previousPool);
  const next = cleanIds(nextPool);
  const now = new Date();

  const previousIds = new Set(previous);
  const nextIds = new Set(next);
  const added = next.filter((id) => !previousIds.has(id));
  const removed = previous.filter((id) => !nextIds.has(id));

  const statsOps = [
    ...added.map((gameId) => ({
      updateOne: {
        filter: { gameId },
        update: { $inc: { includedCount: 1 }, $set: { updatedAt: now } },
        upsert: true,
      },
    })),
    ...removed.map((gameId) => ({
      updateOne: {
        filter: { gameId },
        update: { $inc: { includedCount: -1 }, $set: { updatedAt: now } },
        upsert: true,
      },
    })),
  ];

  const previousPairs = pairSet(previous);
  const nextPairs = pairSet(next);
  const addedPairs = [...nextPairs].filter((key) => !previousPairs.has(key));
  const removedPairs = [...previousPairs].filter((key) => !nextPairs.has(key));

  const pairOps = [
    ...addedPairs.map((key) => {
      const [gameA, gameB] = parsePair(key);
      return {
        updateOne: {
          filter: { pairKey: key },
          update: { $inc: { count: 1 }, $set: { gameA, gameB, updatedAt: now } },
          upsert: true,
        },
      };
    }),
    ...removedPairs.map((key) => {
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
