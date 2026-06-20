import { nanoid } from 'nanoid';

import { COLLECTIONS, getDb } from './mongo';

/** Tier rows, highest to lowest. */
export const TIERS = ['S', 'A', 'B', 'C', 'D', 'E', 'F'] as const;
export type Tier = (typeof TIERS)[number];

/** Game ids placed in each tier row. */
export type TierMap = Record<Tier, number[]>;

/** Minimal per-game data embedded in a snapshot so the share view needs no extra lookups. */
export interface SnapshotGame {
  igdbId: number;
  title: string;
  coverUrl: string | null;
}

export interface ListInput {
  tiers: TierMap;
  games: SnapshotGame[];
}

export interface ListDoc extends ListInput {
  shareId: string;
  createdAt: Date;
}

/** Per-game community tier counts (anonymous aggregate — no session identifier). */
export interface GameStatsDoc {
  gameId: number;
  counts: Record<Tier, number>;
  total: number;
}

async function listsCollection() {
  return (await getDb()).collection<ListDoc>(COLLECTIONS.lists);
}

async function gameStatsCollection() {
  return (await getDb()).collection<GameStatsDoc>(COLLECTIONS.gameStats);
}

/** Normalize an arbitrary tiers object into a complete TierMap with numeric ids only. */
export function normalizeTiers(input: unknown): TierMap {
  const source = (input ?? {}) as Record<string, unknown>;
  const out = {} as TierMap;
  for (const tier of TIERS) {
    const raw = Array.isArray(source[tier]) ? (source[tier] as unknown[]) : [];
    out[tier] = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  }
  return out;
}

/**
 * Increment the community tier counts for every placed game. Counts only — no session id is
 * ever written, so the aggregate stays anonymous and no background job is needed.
 */
async function incrementGameStats(tiers: TierMap): Promise<void> {
  const coll = await gameStatsCollection();
  const ops = [];
  for (const tier of TIERS) {
    for (const gameId of tiers[tier]) {
      ops.push({
        updateOne: {
          filter: { gameId },
          update: { $inc: { [`counts.${tier}`]: 1, total: 1 } },
          upsert: true,
        },
      });
    }
  }
  if (ops.length) await coll.bulkWrite(ops);
}

/**
 * Publish an immutable tier-list snapshot. Returns the short, URL-safe `shareId`. Also bumps
 * the anonymous per-game community tier counts consumed by Phase 11.
 */
export async function createList(input: ListInput): Promise<{ shareId: string }> {
  const tiers = normalizeTiers(input.tiers);
  const shareId = nanoid(10);
  const coll = await listsCollection();

  await coll.insertOne({
    shareId,
    tiers,
    games: input.games ?? [],
    createdAt: new Date(),
  });

  await incrementGameStats(tiers);
  return { shareId };
}

/** Fetch a published snapshot by its shareId, or null if unknown. */
export async function getList(shareId: string): Promise<ListDoc | null> {
  const coll = await listsCollection();
  return coll.findOne({ shareId }, { projection: { _id: 0 } });
}

/** Anonymous community tier counts for the given games (Phase 11 comparison). */
export async function getGameStats(gameIds: number[]): Promise<GameStatsDoc[]> {
  if (gameIds.length === 0) return [];
  const coll = await gameStatsCollection();
  return coll.find({ gameId: { $in: gameIds } }, { projection: { _id: 0 } }).toArray();
}

/** Total published lists — the "based on N lists" sample size for the comparison stat. */
export async function countLists(): Promise<number> {
  const coll = await listsCollection();
  return coll.countDocuments();
}
