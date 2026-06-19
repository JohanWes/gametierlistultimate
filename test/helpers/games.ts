import type { Game, GameResult } from '@/lib/games/types';

/** Build a normalized Game for tests, overridable per field. */
export function makeGame(overrides: Partial<Game> & { igdbId: number; title: string }): Game {
  return {
    coverUrl: null,
    genres: [],
    platforms: [],
    releaseYear: 2015,
    popularity: null,
    rating: 80,
    summary: null,
    hasCover: false,
    category: 0,
    ...overrides,
  };
}

/** A run of `count` distinct games, ids/titles offset by `start`. */
export function makeGames(count: number, start = 1): Game[] {
  return Array.from({ length: count }, (_, i) =>
    makeGame({ igdbId: start + i, title: `Game ${start + i}` }),
  );
}

/** A search result with an explicit source tag. */
export function makeResult(
  overrides: Partial<GameResult> & { igdbId: number; title: string; source: GameResult['source'] },
): GameResult {
  return { ...makeGame(overrides), source: overrides.source };
}

/** A fetch stub returning the given JSON body, shaped like the fetch the client expects. */
export function jsonFetch(body: unknown): typeof fetch {
  return (async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch;
}
