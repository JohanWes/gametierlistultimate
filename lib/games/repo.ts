import type { Collection, Document } from 'mongodb';

import { COLLECTIONS, getDb } from '../mongo';
import { getCooccurrenceScores } from '../pool-patterns-repo';
import { DLC_CATEGORIES, isDlc, normalizeMongoDoc } from './normalize';
import { setResolvedStarterIds, STARTER_GAME_NAMES } from './starter-set';
import type { Game, Preferences, SuggestionContext } from './types';

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

/**
 * Onboarding shows friendly genre labels, but the dataset stores IGDB genre strings
 * ("Role-playing (RPG)", "Simulator", "Sport", "Platform", …). Map each label to the
 * substring(s) that actually appear in the data so a selection isn't silently ignored.
 * Labels with no genre equivalent (they're IGDB themes/keywords) map to the closest genres.
 */
const GENRE_TERMS: Record<string, string[]> = {
  RPG: ['Role-playing', 'RPG'],
  Action: ['Hack and slash', 'Fighting', 'Arcade'],
  Adventure: ['Adventure', 'Point-and-click'],
  Strategy: ['Strategy', 'Tactical'],
  Shooter: ['Shooter'],
  Platformer: ['Platform'],
  Horror: ['Horror'],
  Racing: ['Racing'],
  Fighting: ['Fighting'],
  Puzzle: ['Puzzle'],
  Simulation: ['Simulat'],
  Sports: ['Sport'],
  Indie: ['Indie'],
  Multiplayer: ['MOBA'],
  'Story-rich': ['Visual Novel', 'Adventure'],
  'Open world': ['Adventure', 'Role-playing'],
};

/** Expand selected genre labels into the case-insensitive regexes that match the dataset. */
function genreRegexes(genres: string[]): RegExp[] {
  const terms = new Set<string>();
  for (const genre of genres) {
    for (const term of GENRE_TERMS[genre] ?? [genre]) terms.add(term);
  }
  return [...terms].map(caseInsensitiveRegex);
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

function preferenceScore(game: Game, prefs: Preferences): number {
  let score = 0;
  if (prefs.genres?.length) {
    const regexes = genreRegexes(prefs.genres);
    if (game.genres.some((genre) => regexes.some((re) => re.test(genre)))) score += 16;
  }
  if (prefs.platforms?.length) {
    const platforms = prefs.platforms.map(caseInsensitiveRegex);
    if (game.platforms.some((platform) => platforms.some((re) => re.test(platform)))) score += 8;
  }
  return score;
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

function titleAffinity(game: Game, seeds: Game[]): number {
  const tokens = new Set(titleTokens(game.title));
  if (tokens.size === 0) return 0;

  let best = 0;
  for (const seed of seeds) {
    const seedTokens = titleTokens(seed.title);
    const shared = seedTokens.filter((token) => tokens.has(token)).length;
    if (shared >= 2) best = Math.max(best, 48);
    else if (shared === 1) best = Math.max(best, 22);
  }
  return best;
}

function genreAffinity(game: Game, seeds: Game[]): number {
  const genres = new Set(game.genres.map((g) => g.toLowerCase()));
  if (genres.size === 0) return 0;

  let shared = 0;
  for (const seed of seeds) {
    for (const genre of seed.genres) {
      if (genres.has(genre.toLowerCase())) shared += 1;
    }
  }
  return Math.min(shared * 5, 20);
}

function popularityScore(game: Game): number {
  const rating = game.rating ?? 0;
  const popularity = game.popularity ?? 0;
  return rating / 10 + Math.log10(popularity + 1) * 4;
}

function nearRejectedPenalty(game: Game, rejected: Game[]): number {
  if (rejected.length === 0) return 0;
  return Math.min(titleAffinity(game, rejected) * 0.5 + genreAffinity(game, rejected) * 0.35, 24);
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
  context: SuggestionContext = {},
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
    prefOr.push({ genre: { $in: genreRegexes(prefs.genres) } });
  }
  if (prefs.platforms?.length) {
    prefOr.push({ platform: { $in: prefs.platforms.map(caseInsensitiveRegex) } });
  }

  const seedIds = normalizedIds(context.seedIds);
  const rejectIds = normalizedIds(context.rejectIds);
  const hasAdaptiveContext = seedIds.length > 0 || rejectIds.length > 0;
  const sort: Document = { rating: -1 };
  const projection = undefined;
  const fetchLimit = suggestionFetchLimit(limit);

  // Curated starter shelf: when preset is requested and the pool is cold (no seeds), serve the
  // hand-picked iconic games first so the user's accepts can branch into the pre-seeded persona
  // co-occurrence clusters. Once the user has any seeds, personalization takes over and preset
  // is ignored. The `exclude` list is honored so the backlog prefetch (which excludes the
  // already-visible ids) gets the *next* starter games rather than the same batch again.
  if (context.preset && !hasAdaptiveContext) {
    const excludeSet = new Set(exclude);
    // Resolve the full shelf once, then filter out excluded ids. This is a single full-collection
    // scan (cached ids in starter-set.ts), and the shelf is only ~36 games, so slicing is cheap.
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
        .find({ $and: fillerAnd }, { projection })
        .sort(sort)
        .limit(suggestionFetchLimit(limit - starters.length))
        .toArray();
      return dedupeSuggestions([...starters, ...filler.map(normalizeMongoDoc)], limit);
    }
    // No starters resolved — fall through to the normal cold-start path.
  }

  if (hasAdaptiveContext) {
    const [candidateDocs, seedGames, rejectedGames, coScores] = await Promise.all([
      coll.find({ $and: and }, { projection }).toArray(),
      getByIds(seedIds),
      getByIds(rejectIds),
      getCooccurrenceScores(seedIds),
    ]);

    const candidates = candidateDocs.map(normalizeMongoDoc);
    const scored = candidates
      .map((game) => {
        const coScore = Math.log2((coScores.get(game.igdbId) ?? 0) + 1) * 90;
        const score =
          coScore +
          titleAffinity(game, seedGames) +
          genreAffinity(game, seedGames) +
          preferenceScore(game, prefs) +
          popularityScore(game) -
          nearRejectedPenalty(game, rejectedGames);
        return { game, score };
      })
      .sort((a, b) => b.score - a.score || (b.game.rating ?? 0) - (a.game.rating ?? 0))
      .map((entry) => entry.game);

    return dedupeSuggestions(scored, limit);
  }

  // When preferences are given, fetch a preference-matching batch first, then top up with
  // generally-strong games so the pool is never empty even for narrow tastes.

  if (prefOr.length === 0) {
    const docs = await coll
      .find({ $and: and }, { projection })
      .sort(sort)
      .limit(fetchLimit)
      .toArray();
    return dedupeSuggestions(docs.map(normalizeMongoDoc), limit);
  }

  const preferred = await coll
    .find({ $and: [...and, { $or: prefOr }] }, { projection })
    .sort(sort)
    .limit(fetchLimit)
    .toArray();

  if (preferred.length >= limit) {
    const dedupedPreferred = dedupeSuggestions(preferred.map(normalizeMongoDoc), limit);
    if (dedupedPreferred.length >= limit) return dedupedPreferred;
  }

  const have = new Set(preferred.map((d) => d.id));
  const fillerExclude = [...exclude, ...have];
  const filler = await coll
    .find({ $and: [...and.slice(0, 2), { id: { $nin: fillerExclude } }] }, { projection })
    .sort(sort)
    .limit(fetchLimit)
    .toArray();

  return dedupeSuggestions([...preferred, ...filler].map(normalizeMongoDoc), limit);
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
 * Resolve a set of display names to `Game` records, preserving the requested order. Matches
 * first by exact (case-insensitive) name, then by NFKD-normalized name (handles diacritics,
 * punctuation, and `&`/`and` differences), then by a substring fallback that prefers the
 * shortest matching DB name (more specific). Unresolved names are skipped silently — the
 * caller gets back only the games that exist in the collection, in the same relative order.
 *
 * Modeled on the fuzzy matcher in `scripts/seed-pool-patterns.ts` so the curated starter
 * shelf (`STARTER_GAME_NAMES`) resolves identically to how the persona seeding does.
 */
export async function getByNames(names: string[]): Promise<Game[]> {
  const cleaned = [...new Set(names.map((n) => (typeof n === 'string' ? n.trim() : '')).filter(Boolean))];
  if (cleaned.length === 0) return [];

  const coll = await gamesCollection();
  const docs = await coll.find({}).toArray();
  const all = docs.map(normalizeMongoDoc);

  const byExact = new Map<string, Game>();
  const byNormalized = new Map<string, Game>();
  for (const g of all) {
    const lower = g.title.toLowerCase();
    if (!byExact.has(lower)) byExact.set(lower, g);
    const norm = titleKey(g.title);
    if (!byNormalized.has(norm)) byNormalized.set(norm, g);
  }

  const resolved = new Map<string, Game>();
  const stillMissing: string[] = [];

  // Pass 1: exact + normalized.
  for (const name of cleaned) {
    if (resolved.has(name)) continue;
    const exact = byExact.get(name.toLowerCase());
    if (exact) {
      resolved.set(name, exact);
      continue;
    }
    const norm = titleKey(name);
    const normMatch = byNormalized.get(norm);
    if (normMatch) resolved.set(name, normMatch);
    else stillMissing.push(name);
  }

  // Pass 2: substring fallback for the unresolved — prefer the shortest matching DB title.
  // Guard against short common-word false positives by requiring the normalized query to be
  // at least 4 chars (all curated starter names are ≥ 5 chars, so this never blocks them
  // while preventing 1-3 char queries from matching unrelated games).
  const MIN_SUBSTR_LEN = 4;
  for (const name of stillMissing) {
    const norm = titleKey(name);
    if (norm.length < MIN_SUBSTR_LEN) continue;
    let best: Game | null = null;
    let bestLen = Infinity;
    for (const g of all) {
      const gNorm = titleKey(g.title);
      if (gNorm === norm) {
        best = g;
        break;
      }
      if (gNorm.length >= MIN_SUBSTR_LEN && (gNorm.includes(norm) || norm.includes(gNorm))) {
        if (g.title.length < bestLen) {
          best = g;
          bestLen = g.title.length;
        }
      }
    }
    if (best) resolved.set(name, best);
  }

  return cleaned.map((name) => resolved.get(name)).filter((g): g is Game => !!g);
}

/**
 * Resolve the curated starter shelf (`STARTER_GAME_NAMES`) to full `Game` records in shelf
 * order. Used by `getSuggestions` when `context.preset === true` and the pool is cold
 * (no seed ids). Unresolved names are skipped, so a missing game shortens the shelf without
 * crashing. Side effect: caches the resolved IGDB ids via `setResolvedStarterIds` so the
 * predictor guardrail in `lib/pool-stats-service.ts` can exclude them from co-occurrence writes.
 *
 * DLC/expansions are filtered out defensively — the curated list is hand-picked main games,
 * but a fuzzy substring match could theoretically pull in an edition variant.
 */
export async function getStarterSet(limit?: number): Promise<Game[]> {
  const resolved = await getByNames([...STARTER_GAME_NAMES]);
  const filtered = resolved.filter((g) => !isDlc(g));
  setResolvedStarterIds(filtered.map((g) => g.igdbId));
  return typeof limit === 'number' && limit > 0 ? filtered.slice(0, limit) : filtered;
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
