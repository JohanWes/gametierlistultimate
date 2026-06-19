/**
 * The single normalized game shape used everywhere in the app. Both MongoDB documents and
 * raw IGDB API responses are mapped onto this via lib/games/normalize.ts.
 */
export interface Game {
  /** IGDB id — the stable cross-source identifier (Mongo `id`, IGDB `id`). */
  igdbId: number;
  title: string;
  /** Fully-resolved cover image URL, or null when the source has no cover. */
  coverUrl: string | null;
  genres: string[];
  platforms: string[];
  releaseYear: number | null;
  /** 0–100ish popularity signal. Absent in the current Mongo dataset → null. */
  popularity: number | null;
  /** 0–100 rating. */
  rating: number | null;
  summary: string | null;
  /** Derived: whether a usable cover image exists. */
  hasCover: boolean;
  /**
   * IGDB game category (0 = main game, 1 = DLC, 2 = expansion, …). Used to filter out
   * DLC/expansions from suggestions. Absent in the current Mongo dataset → null.
   */
  category: number | null;
}

/** A search/suggestion result tagged with where it came from. */
export interface GameResult extends Game {
  source: 'local' | 'igdb';
}

/** Onboarding preferences that bias suggestions. */
export interface Preferences {
  /** Preferred genres (matched case-insensitively against a game's genres). */
  genres?: string[];
  /** Preferred platforms. */
  platforms?: string[];
}

/** Session-local context used to make pool suggestions adapt after each decision. */
export interface SuggestionContext {
  /** Games the player has already confirmed as played. */
  seedIds?: number[];
  /** Games explicitly passed in this pool-building session. */
  rejectIds?: number[];
}
