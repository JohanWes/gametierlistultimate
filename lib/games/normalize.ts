import type { Game } from './types';

/** IGDB image CDN — `t_cover_big_2x` keeps enlarged cover cards crisp without client filters. */
export const IGDB_IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload';
const IGDB_COVER_SIZE = 't_cover_big_2x';

/**
 * IGDB game categories that are NOT standalone main games and should be kept out of
 * suggestions: DLC/add-on (1), expansion (2), bundle (3), episode (6), season (7).
 */
export const DLC_CATEGORIES = new Set([1, 2, 3, 6, 7]);

/** True when the game is a DLC/expansion/bundle rather than a standalone title. */
export function isDlc(game: Pick<Game, 'category'>): boolean {
  return game.category != null && DLC_CATEGORIES.has(game.category);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v : typeof v?.name === 'string' ? v.name : null))
      .filter((v): v is string => !!v && v.trim() !== '');
  }
  if (typeof value === 'string' && value.trim() !== '') return [value.trim()];
  return [];
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildGame(partial: Omit<Game, 'hasCover'>): Game {
  return { ...partial, hasCover: !!partial.coverUrl };
}

export function sharpenIgdbCoverUrl(url: string): string {
  return url.replace('/t_cover_big/', `/${IGDB_COVER_SIZE}/`);
}

/**
 * Normalize a MongoDB games document. The legacy dataset stores: `id` (IGDB id), `name`,
 * `year`, `platform` (single string), `genre` (single string), `rating` (0–100), `cover`
 * (already a full URL), `synopsis`. `popularity` and `category` are absent → null.
 *
 * IGDB-sourced docs upserted by `upsertGames` use the IGDB field name `summary` instead of
 * `synopsis`; we read `synopsis` first and fall back to `summary` so both shapes round-trip.
 */
export function normalizeMongoDoc(doc: Record<string, unknown>): Game {
  const cover =
    typeof doc.cover === 'string' && doc.cover.trim() !== ''
      ? sharpenIgdbCoverUrl(doc.cover)
      : null;
  const summaryRaw = doc.synopsis ?? doc.summary;
  return buildGame({
    igdbId: Number(doc.id),
    title: String(doc.name ?? ''),
    coverUrl: cover,
    genres: toStringArray(doc.genre ?? doc.genres),
    platforms: toStringArray(doc.platform ?? doc.platforms),
    releaseYear: toNumberOrNull(doc.year),
    popularity: toNumberOrNull(doc.popularity),
    rating: toNumberOrNull(doc.rating),
    summary: typeof summaryRaw === 'string' ? summaryRaw : null,
    category: toNumberOrNull(doc.category),
  });
}

interface IgdbRawGame {
  id: number;
  name?: string;
  cover?: { image_id?: string } | null;
  genres?: Array<{ name?: string }> | null;
  platforms?: Array<{ name?: string }> | null;
  first_release_date?: number | null;
  rating?: number | null;
  total_rating?: number | null;
  total_rating_count?: number | null;
  summary?: string | null;
  category?: number | null;
}

/** Build a cover URL from an IGDB `image_id`. */
export function igdbCoverUrl(imageId: string | undefined | null): string | null {
  return imageId ? `${IGDB_IMAGE_BASE}/${IGDB_COVER_SIZE}/${imageId}.jpg` : null;
}

/** Normalize a raw IGDB `/games` API response object. */
export function normalizeIgdb(raw: IgdbRawGame): Game {
  const rating = toNumberOrNull(raw.rating) ?? toNumberOrNull(raw.total_rating);
  const releaseYear =
    typeof raw.first_release_date === 'number'
      ? new Date(raw.first_release_date * 1000).getUTCFullYear()
      : null;
  return buildGame({
    igdbId: Number(raw.id),
    title: String(raw.name ?? ''),
    coverUrl: igdbCoverUrl(raw.cover?.image_id),
    genres: toStringArray(raw.genres),
    platforms: toStringArray(raw.platforms),
    releaseYear,
    popularity: toNumberOrNull(raw.total_rating_count),
    rating: rating == null ? null : Math.round(rating),
    summary: typeof raw.summary === 'string' ? raw.summary : null,
    category: toNumberOrNull(raw.category),
  });
}
