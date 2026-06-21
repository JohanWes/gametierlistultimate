import type { Game, GameResult, Preferences } from './types';

/**
 * Browser-side wrappers around the game API routes. Both accept an injectable `fetchImpl`
 * (defaulting to the global `fetch`) so components can be unit-tested with a stub — the same
 * pattern `startAutosave` uses. Network/parse failures resolve to an empty list rather than
 * throwing, keeping the pool UI forgiving.
 */

export interface SuggestionQuery {
  prefs?: Preferences;
  /** IGDB ids to keep out of the results (already decided/added). */
  exclude?: number[];
  /** Confirmed played games that should steer follow-up suggestions. */
  seedIds?: number[];
  /** Passed games that should softly down-rank nearby suggestions for this session. */
  rejectIds?: number[];
  /**
   * When true and seedIds is empty, request the curated starter shelf first. Used by the
   * pool step to kick off branching from the pre-seeded persona clusters.
   */
  preset?: boolean;
  limit?: number;
}

/**
 * GET /api/games/suggestions — preference-biased candidate games, minus the exclude list.
 * Throws on a failed request so the caller can distinguish "no games left" (an empty array)
 * from "the request failed" (a transient error worth retrying) rather than dead-ending the UI.
 */
export async function fetchSuggestions(
  query: SuggestionQuery = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Game[]> {
  const params = new URLSearchParams();
  if (query.prefs?.genres?.length) params.set('genres', query.prefs.genres.join(','));
  if (query.prefs?.platforms?.length) params.set('platforms', query.prefs.platforms.join(','));
  if (query.exclude?.length) params.set('exclude', query.exclude.join(','));
  if (query.seedIds?.length) params.set('seedIds', query.seedIds.join(','));
  if (query.rejectIds?.length) params.set('rejectIds', query.rejectIds.join(','));
  if (query.preset) params.set('preset', 'true');
  if (query.limit) params.set('limit', String(query.limit));

  const res = await fetchImpl(`/api/games/suggestions?${params.toString()}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`suggestions request failed: ${res.status}`);
  const data = (await res.json()) as { games?: Game[] };
  return Array.isArray(data.games) ? data.games : [];
}

/** GET /api/games/search — local-first, IGDB fallback. Blank queries skip the network. */
export async function searchGames(
  q: string,
  options: { limit?: number } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<GameResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({ q: trimmed });
  if (options.limit) params.set('limit', String(options.limit));

  try {
    const res = await fetchImpl(`/api/games/search?${params.toString()}`, {
      credentials: 'same-origin',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: GameResult[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    // Search stays forgiving — a failed query simply shows no results.
    return [];
  }
}
