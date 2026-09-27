import type { Game, GameResult } from './types';

/**
 * Browser-side wrappers around the game API routes. `fetchSuggestions` throws on failure so the
 * pool step can retry; the video lookup and search degrade to null / an empty list.
 */

export interface SuggestionQuery {
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
 * GET /api/games/suggestions — candidate games biased by what the user already accepted
 * (seedIds) and passed on (rejectIds), minus the exclude list.
 * Throws on a failed request so the caller can distinguish "no games left" (an empty array)
 * from "the request failed" (a transient error worth retrying) rather than dead-ending the UI.
 */
export async function fetchSuggestions(query: SuggestionQuery = {}): Promise<Game[]> {
  const params = new URLSearchParams();
  if (query.exclude?.length) params.set('exclude', query.exclude.join(','));
  if (query.seedIds?.length) params.set('seedIds', query.seedIds.join(','));
  if (query.rejectIds?.length) params.set('rejectIds', query.rejectIds.join(','));
  if (query.preset) params.set('preset', 'true');
  if (query.limit) params.set('limit', String(query.limit));

  const res = await fetch(`/api/games/suggestions?${params.toString()}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`suggestions request failed: ${res.status}`);
  const data = (await res.json()) as { games?: Game[] };
  return Array.isArray(data.games) ? data.games : [];
}

/**
 * GET /api/games/:igdbId/video — resolve a game to a YouTube gameplay video id (cached server-side).
 * Returns null on a miss or any failure so the modal falls back to a link-out. The server reads the
 * search title from its own data, so no title is sent from the client.
 */
export async function fetchGameplayVideo(igdbId: number): Promise<string | null> {
  if (!Number.isFinite(igdbId)) return null;
  try {
    const res = await fetch(`/api/games/${igdbId}/video`, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const data = (await res.json()) as { videoId?: string | null };
    return typeof data.videoId === 'string' ? data.videoId : null;
  } catch {
    return null;
  }
}

/** GET /api/games/search — local-first, IGDB fallback. Blank queries skip the network. */
export async function searchGames(
  q: string,
  options: { limit?: number } = {},
): Promise<GameResult[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({ q: trimmed });
  if (options.limit) params.set('limit', String(options.limit));

  try {
    const res = await fetch(`/api/games/search?${params.toString()}`, {
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
