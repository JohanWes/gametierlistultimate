import type { Collection, Document } from 'mongodb';

import { COLLECTIONS, getDb } from '../mongo';
import { DLC_CATEGORIES, normalizeMongoDoc } from './normalize';
import type { Game, Preferences } from './types';

async function gamesCollection(): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection(COLLECTIONS.games);
}

let indexesEnsured = false;

/**
 * Create the indexes the queries rely on, once per process. Idempotent — MongoDB ignores
 * a createIndex for an index that already exists.
 */
export async function ensureGameIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const coll = await gamesCollection();
  await Promise.all([
    coll.createIndex({ name: 'text' }, { name: 'name_text' }),
    coll.createIndex({ id: 1 }, { name: 'id_idx' }),
    coll.createIndex({ genre: 1 }, { name: 'genre_idx' }),
    coll.createIndex({ rating: -1 }, { name: 'rating_idx' }),
  ]);
  indexesEnsured = true;
}

/** Exclude DLC/expansions if a category field exists; docs without category are kept. */
const NOT_DLC_FILTER = {
  $or: [{ category: { $exists: false } }, { category: { $nin: [...DLC_CATEGORIES] } }],
};

function caseInsensitiveRegex(query: string): RegExp {
  // Escape regex metacharacters in the user-supplied query.
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/**
 * Candidate games for the ranking pool, biased by onboarding preferences. Prioritizes games
 * with cover art and high rating, honors genre/platform preferences, excludes DLC and any
 * ids already in the pool, and respects the limit.
 */
export async function getSuggestions(
  prefs: Preferences = {},
  exclude: number[] = [],
  limit = 30,
): Promise<Game[]> {
  const coll = await gamesCollection();

  const and: Document[] = [
    NOT_DLC_FILTER,
    // Require a cover so suggestions look good; coverless games are skipped.
    { cover: { $type: 'string', $ne: '' } },
  ];
  if (exclude.length) and.push({ id: { $nin: exclude } });

  const prefOr: Document[] = [];
  if (prefs.genres?.length) {
    prefOr.push({ genre: { $in: prefs.genres.map(caseInsensitiveRegex) } });
  }
  if (prefs.platforms?.length) {
    prefOr.push({ platform: { $in: prefs.platforms.map(caseInsensitiveRegex) } });
  }

  // When preferences are given, fetch a preference-matching batch first, then top up with
  // generally-strong games so the pool is never empty even for narrow tastes.
  const sort: Document = { rating: -1 };
  const projection = undefined;

  if (prefOr.length === 0) {
    const docs = await coll
      .find({ $and: and }, { projection })
      .sort(sort)
      .limit(limit)
      .toArray();
    return docs.map(normalizeMongoDoc);
  }

  const preferred = await coll
    .find({ $and: [...and, { $or: prefOr }] }, { projection })
    .sort(sort)
    .limit(limit)
    .toArray();

  if (preferred.length >= limit) {
    return preferred.slice(0, limit).map(normalizeMongoDoc);
  }

  const have = new Set(preferred.map((d) => d.id));
  const fillerExclude = [...exclude, ...have];
  const filler = await coll
    .find({ $and: [...and.slice(0, 2), { id: { $nin: fillerExclude } }] }, { projection })
    .sort(sort)
    .limit(limit - preferred.length)
    .toArray();

  return [...preferred, ...filler].slice(0, limit).map(normalizeMongoDoc);
}

/** Case-insensitive partial-title search over the local collection. */
export async function searchLocal(query: string, limit = 20): Promise<Game[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const coll = await gamesCollection();
  const docs = await coll
    .find({ name: caseInsensitiveRegex(trimmed) })
    .sort({ rating: -1 })
    .limit(limit)
    .toArray();
  return docs.map(normalizeMongoDoc);
}

/** Hydrate a set of games by their IGDB ids, preserving the requested order. */
export async function getByIds(ids: number[]): Promise<Game[]> {
  const valid = ids.filter((id) => Number.isFinite(id));
  if (valid.length === 0) return [];
  const coll = await gamesCollection();
  const docs = await coll.find({ id: { $in: valid } }).toArray();
  const byId = new Map(docs.map((d) => [Number(d.id), normalizeMongoDoc(d)]));
  return valid.map((id) => byId.get(id)).filter((g): g is Game => !!g);
}

/**
 * Upsert IGDB-sourced games into the local collection so future searches hit Mongo first.
 * Keyed on the IGDB `id`. Stores the normalized shape alongside the source fields the local
 * dataset uses (name/cover) so it blends with existing docs.
 */
export async function upsertGames(games: Game[]): Promise<void> {
  if (games.length === 0) return;
  const coll = await gamesCollection();
  await coll.bulkWrite(
    games.map((g) => ({
      updateOne: {
        filter: { id: g.igdbId },
        update: {
          $set: {
            id: g.igdbId,
            name: g.title,
            cover: g.coverUrl,
            genre: g.genres,
            platform: g.platforms,
            year: g.releaseYear,
            rating: g.rating,
            popularity: g.popularity,
            summary: g.summary,
            category: g.category,
          },
        },
        upsert: true,
      },
    })),
  );
}
