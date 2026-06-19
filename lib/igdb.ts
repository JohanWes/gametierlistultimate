import { getEnv } from './env';
import { normalizeIgdb } from './games/normalize';
import type { Game } from './games/types';

/** Twitch OAuth token endpoint (client-credentials grant). */
export const IGDB_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
/** IGDB games query endpoint. */
export const IGDB_GAMES_URL = 'https://api.igdb.com/v4/games';

/** Fields requested from IGDB so the normalizer gets a predictable shape. */
const IGDB_FIELDS =
  'fields name, cover.image_id, genres.name, platforms.name, first_release_date, rating, total_rating, total_rating_count, summary, category;';

interface CachedToken {
  token: string;
  /** epoch ms at which the token should be considered expired. */
  expiresAt: number;
}

// Module-scope cache: survives warm serverless invocations, refetched on cold start.
// No persistent storage — safe for Vercel's stateless functions.
let cachedToken: CachedToken | null = null;

/** Clear the cached access token (used by tests). */
export function resetIgdbToken(): void {
  cachedToken = null;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const { IGDB_CLIENT_ID, IGDB_CLIENT_SECRET } = getEnv();
  const params = new URLSearchParams({
    client_id: IGDB_CLIENT_ID,
    client_secret: IGDB_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });

  const res = await fetch(`${IGDB_TOKEN_URL}?${params.toString()}`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`IGDB token request failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh a minute early to avoid edge-of-expiry failures.
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

function escapeQuery(query: string): string {
  return query.replace(/"/g, '\\"');
}

/**
 * Search IGDB for games matching `query`, returning normalized {@link Game}s with resolved
 * cover URLs. Server-side only — never call from the client (it would leak credentials).
 */
export async function searchIgdb(query: string, limit = 20): Promise<Game[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const token = await getAccessToken();
  const { IGDB_CLIENT_ID } = getEnv();
  const body = `search "${escapeQuery(trimmed)}"; ${IGDB_FIELDS} where version_parent = null; limit ${limit};`;

  const res = await fetch(IGDB_GAMES_URL, {
    method: 'POST',
    headers: {
      'Client-ID': IGDB_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`IGDB search failed: ${res.status} ${res.statusText}`);
  }

  const raw = (await res.json()) as Array<{ id: number }>;
  return raw.filter((g) => g && typeof g.id === 'number').map((g) => normalizeIgdb(g));
}
