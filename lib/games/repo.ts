import type { Collection, Document } from 'mongodb';

import { COLLECTIONS, getDb } from '../mongo';
import { getCooccurrenceScores } from '../pool-patterns-repo';
import { DLC_CATEGORIES, normalizeMongoDoc } from './normalize';
import { STARTER_COVERS } from './starter-covers';
import { STARTER_IDS } from './starter-set';
import type { Game, SuggestionContext } from './types';

let indexesEnsured = false;

async function gamesCollection(): Promise<Collection<Document>> {
  const db = await getDb();
  const coll = db.collection(COLLECTIONS.games);
  // Lazily ensure the indexes the hot queries rely on (`id` lookups/excludes, `rating` sort),
  // once per process. Fire-and-forget: createIndex is idempotent and must never block a request.
  if (!indexesEnsured) {
    indexesEnsured = true;
    void Promise.all([
      coll.createIndex({ id: 1 }, { name: 'id_idx' }),
      coll.createIndex({ rating: -1 }, { name: 'rating_idx' }),
    ]).catch(() => {
      indexesEnsured = false; // retry on a later request
    });
  }
  return coll;
}

/** Exclude DLC/expansions if a category field exists; docs without category are kept. */
const NOT_DLC_FILTER = {
  $or: [{ category: { $exists: false } }, { category: { $nin: [...DLC_CATEGORIES] } }],
};

/** Fields the suggestion ranker needs — no covers so hot reads stay lean. */
const SCORING_PROJECTION: Document = {
  _id: 0,
  id: 1,
  name: 1,
  genre: 1,
  genres: 1,
  rating: 1,
  popularity: 1,
  category: 1,
};

/** Every field `normalizeMongoDoc` consumes — the full Game shape returned to callers. */
const FULL_GAME_PROJECTION: Document = {
  _id: 0,
  id: 1,
  name: 1,
  cover: 1,
  genre: 1,
  genres: 1,
  year: 1,
  popularity: 1,
  rating: 1,
  category: 1,
};

const SUGGESTION_FETCH_MULTIPLIER = 4;
const SUGGESTION_FETCH_FLOOR = 20;

const NON_MAIN_TITLE_PATTERNS = [
  /\b(?:dlc|downloadable content|expansion|add-?on|season pass|map pack)\b/i,
  /\b(?:the frozen wilds|eye of the north|heart of thorns|path of fire|burial at sea)\b/i,
  /(?:^|[:\-])\s*.*\bepisode\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|[ivx]+|\d+)\b/i,
];

const EDITION_SUFFIX_PATTERN =
  /\s*(?:[:\-]\s*)?(?:royal|complete|collector'?s|definitive|deluxe|ultimate|game of the year|goty)\s+edition$/i;
const REMASTERED_SUFFIX_PATTERN = /\s*(?:[:\-]\s*)?remastered$/i;

function caseInsensitiveRegex(query: string): RegExp {
  // Escape regex metacharacters in the user-supplied query.
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function normalizedIds(ids: number[] | undefined): number[] {
  return [...new Set((ids ?? []).filter((id) => Number.isFinite(id)))];
}

function suggestionFetchLimit(limit: number): number {
  return Math.max(
    limit,
    Math.min(200, Math.max(SUGGESTION_FETCH_FLOOR, limit * SUGGESTION_FETCH_MULTIPLIER)),
  );
}

function titleKey(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function baseTitleKey(title: string): string {
  return titleKey(title.replace(EDITION_SUFFIX_PATTERN, '').replace(REMASTERED_SUFFIX_PATTERN, ''));
}

function isLikelyNonMainTitle(game: Game, baseKeys: Set<string>): boolean {
  if (game.category != null && DLC_CATEGORIES.has(game.category)) return true;
  if (NON_MAIN_TITLE_PATTERNS.some((pattern) => pattern.test(game.title))) return true;

  const ownKey = titleKey(game.title);
  const baseKey = baseTitleKey(game.title);
  return baseKey !== ownKey && baseKeys.has(baseKey);
}

function dedupeSuggestions(games: Game[], limit: number): Game[] {
  const baseKeys = new Set(games.map((game) => titleKey(game.title)));
  const seenIds = new Set<number>();
  const seenTitles = new Set<string>();
  const deduped: Game[] = [];

  for (const game of games) {
    if (seenIds.has(game.igdbId)) continue;
    if (isLikelyNonMainTitle(game, baseKeys)) continue;

    const key = titleKey(game.title);
    if (seenTitles.has(key)) continue;

    seenIds.add(game.igdbId);
    seenTitles.add(key);
    deduped.push(game);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

const TITLE_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'edition',
  'game',
  'of',
  'remastered',
  'remake',
  'the',
]);

function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 2 && !TITLE_STOPWORDS.has(token) && !/^\d+$/.test(token));
}

/** Title tokens and genres of a set of games (seeds or rejects), precomputed once per request. */
interface AffinityProfile {
  /** Title tokens per game, kept as arrays so repeated tokens count toward overlap. */
  titleTokens: string[][];
  /** Every lowercased genre across the games, repeats included. */
  genres: string[];
}

function affinityProfile(games: Game[]): AffinityProfile {
  return {
    titleTokens: games.map((game) => titleTokens(game.title)),
    genres: games.flatMap((game) => game.genres.map((g) => g.toLowerCase())),
  };
}

function titleAffinity(tokens: Set<string>, profile: AffinityProfile): number {
  if (tokens.size === 0) return 0;

  let best = 0;
  for (const seedTokens of profile.titleTokens) {
    const shared = seedTokens.filter((token) => tokens.has(token)).length;
    if (shared >= 2) best = Math.max(best, 48);
    else if (shared === 1) best = Math.max(best, 22);
  }
  return best;
}

function genreAffinity(genres: Set<string>, profile: AffinityProfile): number {
  if (genres.size === 0) return 0;
  const shared = profile.genres.filter((genre) => genres.has(genre)).length;
  return Math.min(shared * 5, 20);
}

function popularityScore(game: Game): number {
  const rating = game.rating ?? 0;
  const popularity = game.popularity ?? 0;
  return rating / 10 + Math.log10(popularity + 1) * 4;
}

function nearRejectedPenalty(
  tokens: Set<string>,
  genres: Set<string>,
  rejected: AffinityProfile,
): number {
  return Math.min(
    titleAffinity(tokens, rejected) * 0.5 + genreAffinity(genres, rejected) * 0.35,
    24,
  );
}

/**
 * Candidate games for the ranking pool. Personalization is inferred purely from behavior: games
 * the player accepted (`seedIds`) steer via title/genre affinity plus community co-occurrence,
 * and passed games (`rejectIds`) softly down-rank lookalikes. Cold starts serve top-rated
 * cover-bearing games — or the curated starter shelf when `context.preset` is set. Excludes DLC
 * and any ids already in the pool, and respects the limit.
 */
export async function getSuggestions(
  exclude: number[] = [],
  limit = 30,
  context: SuggestionContext = {},
): Promise<Game[]> {
  const coll = await gamesCollection();

  const and: Document[] = [
    NOT_DLC_FILTER,
    // Require a cover so suggestions look good; coverless games are skipped.
    { cover: { $type: 'string', $ne: '' } },
  ];
  if (exclude.length) and.push({ id: { $nin: exclude } });

  const seedIds = normalizedIds(context.seedIds);
  const rejectIds = normalizedIds(context.rejectIds);
  const hasAdaptiveContext = seedIds.length > 0 || rejectIds.length > 0;
  const sort: Document = { rating: -1 };
  const fetchLimit = suggestionFetchLimit(limit);

  // Curated starter shelf: when preset is requested and the pool is cold (no seeds), serve the
  // hand-picked iconic games first so the user's accepts can branch into the pre-seeded persona
  // co-occurrence clusters. Once the user has any seeds, personalization takes over and preset
  // is ignored. The `exclude` list is honored so the backlog prefetch (which excludes the
  // already-visible ids) gets the *next* starter games rather than the same batch again.
  if (context.preset && !hasAdaptiveContext) {
    const excludeSet = new Set(exclude);
    // The shelf is memoized and only ~36 games, so filtering + slicing per request is cheap.
    const allStarters = await getStarterSet();
    const starters = allStarters.filter((g) => !excludeSet.has(g.igdbId)).slice(0, limit);
    if (starters.length >= limit) {
      return dedupeSuggestions(starters, limit);
    }
    if (starters.length > 0) {
      const have = new Set(starters.map((g) => g.igdbId));
      const fillerExclude = [...exclude, ...have];
      const fillerAnd: Document[] = [NOT_DLC_FILTER, { cover: { $type: 'string', $ne: '' } }];
      if (fillerExclude.length) fillerAnd.push({ id: { $nin: fillerExclude } });
      const filler = await coll
        .find({ $and: fillerAnd }, { projection: FULL_GAME_PROJECTION })
        .sort(sort)
        .limit(suggestionFetchLimit(limit - starters.length))
        .toArray();
      return dedupeSuggestions([...starters, ...filler.map(normalizeMongoDoc)], limit);
    }
    // No starters resolved — fall through to the normal cold-start path.
  }

  if (hasAdaptiveContext) {
    const [candidateDocs, seedGames, rejectedGames, coScores] = await Promise.all([
      coll.find({ $and: and }, { projection: SCORING_PROJECTION }).toArray(),
      getScoringByIds(seedIds),
      getScoringByIds(rejectIds),
      getCooccurrenceScores(seedIds),
    ]);

    const candidates = candidateDocs.map(normalizeMongoDoc);
    const seeds = affinityProfile(seedGames);
    const rejected = affinityProfile(rejectedGames);
    const scored = candidates
      .map((game) => {
        const tokens = new Set(titleTokens(game.title));
        const genres = new Set(game.genres.map((g) => g.toLowerCase()));
        const coScore = Math.log2((coScores.get(game.igdbId) ?? 0) + 1) * 90;
        const score =
          coScore +
          titleAffinity(tokens, seeds) +
          genreAffinity(genres, seeds) +
          popularityScore(game) -
          nearRejectedPenalty(tokens, genres, rejected);
        return { game, score };
      })
      .sort((a, b) => b.score - a.score || (b.game.rating ?? 0) - (a.game.rating ?? 0))
      .map((entry) => entry.game);

    // Rank and dedupe on the lean scoring docs, then hydrate the selected ids so callers
    // receive complete Games (cover, year) in final score order — never the
    // partial scoring shapes.
    const selected = dedupeSuggestions(scored, limit);
    return getByIds(selected.map((game) => game.igdbId));
  }

  // Cold start: top-rated cover-bearing games. Once the user has any seeds, the adaptive
  // context above takes over and personalization is inferred from their accepts/rejects.
  const docs = await coll
    .find({ $and: and }, { projection: FULL_GAME_PROJECTION })
    .sort(sort)
    .limit(fetchLimit)
    .toArray();
  return dedupeSuggestions(docs.map(normalizeMongoDoc), limit);
}

/** Case-insensitive partial-title search over the local collection. */
export async function searchLocal(query: string, limit = 20): Promise<Game[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const coll = await gamesCollection();
  const docs = await coll
    .find({ name: caseInsensitiveRegex(trimmed) }, { projection: FULL_GAME_PROJECTION })
    .sort({ rating: -1 })
    .limit(limit)
    .toArray();
  return docs.map(normalizeMongoDoc);
}

/**
 * Fetch games by IGDB ids with only the fields the suggestion ranker consumes — seeds and
 * rejects never need covers or summaries. Order-preserving, skipping unknown ids.
 */
async function getScoringByIds(ids: number[]): Promise<Game[]> {
  const valid = ids.filter((id) => Number.isFinite(id));
  if (valid.length === 0) return [];
  const coll = await gamesCollection();
  const docs = await coll
    .find({ id: { $in: valid } }, { projection: SCORING_PROJECTION })
    .toArray();
  const byId = new Map(docs.map((d) => [Number(d.id), normalizeMongoDoc(d)]));
  return valid.map((id) => byId.get(id)).filter((g): g is Game => !!g);
}

/** Hydrate a set of games by their IGDB ids, preserving the requested order. */
export async function getByIds(ids: number[]): Promise<Game[]> {
  const valid = ids.filter((id) => Number.isFinite(id));
  if (valid.length === 0) return [];
  const coll = await gamesCollection();
  const docs = await coll
    .find({ id: { $in: valid } }, { projection: FULL_GAME_PROJECTION })
    .toArray();
  const byId = new Map(docs.map((d) => [Number(d.id), normalizeMongoDoc(d)]));
  return valid.map((id) => byId.get(id)).filter((g): g is Game => !!g);
}

/**
 * Process-wide memo of the curated starter shelf (`STARTER_IDS`) in shelf order. It is a fixed
 * list, so loading it once per process avoids a Mongo read on every preset batch. Reset in tests
 * via `resetStarterSetCache`.
 */
let starterSetCache: Game[] | null = null;

/** Clear the memoized starter shelf — used by tests that re-seed the games collection. */
export function resetStarterSetCache(): void {
  starterSetCache = null;
}

/**
 * The curated starter shelf as full `Game` records in shelf order, used by `getSuggestions` when
 * `context.preset` is set and the pool is cold. Ids missing from the collection are skipped.
 * Covers are swapped for the predownloaded same-origin copies (see lib/games/starter-covers.ts)
 * so the pool builder opens with no external-CDN cover loading.
 */
export async function getStarterSet(): Promise<Game[]> {
  starterSetCache ??= (await getByIds([...STARTER_IDS])).map((g) =>
    STARTER_COVERS[g.igdbId] ? { ...g, coverUrl: STARTER_COVERS[g.igdbId] } : g,
  );
  return starterSetCache;
}

/** Cached gameplay-video resolution for a single game (see lib/youtube.ts). */
export interface CachedVideo {
  /** Resolved YouTube id, or null when the last resolve found nothing. */
  videoId: string | null;
  status: 'hit' | 'miss';
  resolvedAt: Date;
}

/**
 * Read a game's cached gameplay-video resolution. Returns null when the game has never been
 * resolved (no `youtubeResolveStatus` on the doc) so the caller knows to resolve fresh.
 */
export async function getCachedVideo(igdbId: number): Promise<CachedVideo | null> {
  if (!Number.isFinite(igdbId)) return null;
  const coll = await gamesCollection();
  const doc = await coll.findOne(
    { id: igdbId },
    { projection: { youtubeVideoId: 1, youtubeResolveStatus: 1, youtubeResolvedAt: 1 } },
  );
  if (!doc || (doc.youtubeResolveStatus !== 'hit' && doc.youtubeResolveStatus !== 'miss')) {
    return null;
  }
  return {
    videoId: typeof doc.youtubeVideoId === 'string' ? doc.youtubeVideoId : null,
    status: doc.youtubeResolveStatus,
    resolvedAt: doc.youtubeResolvedAt instanceof Date ? doc.youtubeResolvedAt : new Date(0),
  };
}

/**
 * Record a gameplay-video resolution (hit or miss) on an existing game doc. `upsert: false` — we
 * never create a stub game from a video lookup; an unknown id is simply a no-op.
 */
export async function setCachedVideo(igdbId: number, videoId: string | null): Promise<void> {
  if (!Number.isFinite(igdbId)) return;
  const coll = await gamesCollection();
  await coll.updateOne(
    { id: igdbId },
    {
      $set: {
        youtubeVideoId: videoId,
        youtubeResolveStatus: videoId ? 'hit' : 'miss',
        youtubeResolvedAt: new Date(),
      },
    },
    { upsert: false },
  );
}

/**
 * Insert IGDB-sourced games into the local collection so future searches hit Mongo first. Keyed
 * on the IGDB `id`; existing docs are never modified (`$setOnInsert`), so IGDB search results
 * can't clobber curated local data such as covers or ratings.
 */
export async function upsertGames(games: Game[]): Promise<void> {
  if (games.length === 0) return;
  const coll = await gamesCollection();
  await coll.bulkWrite(
    games.map((g) => ({
      updateOne: {
        filter: { id: g.igdbId },
        update: {
          $setOnInsert: {
            id: g.igdbId,
            name: g.title,
            cover: g.coverUrl,
            genre: g.genres,
            year: g.releaseYear,
            rating: g.rating,
            popularity: g.popularity,
            category: g.category,
          },
        },
        upsert: true,
      },
    })),
  );
}
