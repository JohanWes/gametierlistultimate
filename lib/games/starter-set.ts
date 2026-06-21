/**
 * Curated "starter shelf" — iconic, state-of-the-art games shown as the first few batches of
 * pool-building suggestions. The user still accepts/rejects each via the normal PoolStep UX
 * (no mandatory count); only accepted ones enter the pool and become predictor seeds.
 *
 * Why a curated shelf exists:
 *   - On a fresh DB the co-occurrence predictor has no signal for a brand-new user. By offering
 *     universally-known flagship titles first, the user's accepts immediately anchor onto the
 *     pre-seeded persona co-occurrence clusters (see `scripts/seed-pool-patterns.ts`), so the
 *     "Spotify-shuffle" branching has something to branch from.
 *   - The set is genre-interleaved so every 5-card batch is diverse and the first batch alone
 *     spans five distinct taste clusters.
 *
 * Every name below is also referenced by at least one persona in `scripts/seed-pool-patterns.ts`
 * (so co-occurrence edges already exist for it), except Limbo and Inside which are added to the
 * Indie + Cinematic personas by the same script. Names resolve against the `games` Mongo
 * collection at runtime via `getByNames` (fuzzy: exact → NFKD-normalized → substring), so a
 * missing game is silently skipped rather than crashing the shelf.
 *
 * Predictor guardrail: `getStarterSetIds()` returns the resolved IGDB ids and is used by
 * `lib/pool-stats-service.ts` to exclude starter games from `updatePoolPatternAggregates` writes —
 * real users can't inflate Witcher 3 et al. into universal popularity hubs. Starter edges stay
 * anchored by the curated persona data only.
 */

export type StarterCategory =
  | 'RPG'
  | 'Soulslike'
  | 'Adventure'
  | 'Indie'
  | 'Cozy'
  | 'Horror'
  | 'Story'
  | 'Shooter'
  | 'Roguelike'
  | 'JRPG'
  | 'Racing'
  | 'Strategy'
  | 'Puzzle';

export interface StarterEntry {
  name: string;
  category: StarterCategory;
}

/**
 * The curated shelf, in the exact genre-interleaved order the API should return them.
 * Invariant: no two entries with the same category share any window of 5 consecutive positions
 * (i.e. every 5-card batch is fully diverse). This is asserted by the unit test.
 *
 * Batch layout (5 cards per batch, last batch has the remainder):
 *   1: RPG · Soulslike · Adventure · Indie · Cozy
 *   2: Horror · Story · Shooter · Roguelike · JRPG
 *   3: Racing · Strategy · Puzzle · RPG · Soulslike
 *   4: Adventure · Indie · Cozy · Horror · Story
 *   5: Shooter · Roguelike · JRPG · Racing · Strategy
 *   6: Puzzle · RPG · Soulslike · Indie · Horror
 *   7: Story · Roguelike · JRPG · Racing · Strategy
 *   8: Puzzle
 */
export const STARTER_ENTRIES: readonly StarterEntry[] = [
  { name: 'The Witcher 3: Wild Hunt', category: 'RPG' },
  { name: 'Elden Ring', category: 'Soulslike' },
  { name: 'The Legend of Zelda: Breath of the Wild', category: 'Adventure' },
  { name: 'Hades', category: 'Indie' },
  { name: 'Animal Crossing: New Horizons', category: 'Cozy' },

  { name: 'Resident Evil 2', category: 'Horror' },
  { name: 'The Last of Us', category: 'Story' },
  { name: 'Doom Eternal', category: 'Shooter' },
  { name: 'The Binding of Isaac: Rebirth', category: 'Roguelike' },
  { name: 'Persona 5 Royal', category: 'JRPG' },

  { name: 'Forza Horizon 5', category: 'Racing' },
  { name: "Sid Meier's Civilization VI", category: 'Strategy' },
  { name: 'Portal 2', category: 'Puzzle' },
  { name: 'The Elder Scrolls 5: Skyrim', category: 'RPG' },
  { name: 'Bloodborne', category: 'Soulslike' },

  { name: 'Super Mario 64', category: 'Adventure' },
  { name: 'Hollow Knight', category: 'Indie' },
  { name: 'Minecraft', category: 'Cozy' },
  { name: 'Silent Hill 2', category: 'Horror' },
  { name: 'God of War', category: 'Story' },

  { name: 'Half-Life 2', category: 'Shooter' },
  { name: 'Slay the Spire', category: 'Roguelike' },
  { name: 'Final Fantasy 7', category: 'JRPG' },
  { name: 'Mario Kart 8', category: 'Racing' },
  { name: 'Crusader Kings 3', category: 'Strategy' },

  { name: 'Limbo', category: 'Puzzle' },
  { name: "Baldur's Gate 3", category: 'RPG' },
  { name: 'Sekiro: Shadows Die Twice', category: 'Soulslike' },
  { name: 'Stardew Valley', category: 'Indie' },
  { name: 'Amnesia: The Dark Descent', category: 'Horror' },

  { name: 'Red Dead Redemption 2', category: 'Story' },
  { name: 'Dead Cells', category: 'Roguelike' },
  { name: 'NieR: Automata', category: 'JRPG' },
  { name: 'Rocket League', category: 'Racing' },
  { name: 'XCOM 2', category: 'Strategy' },

  { name: 'Inside', category: 'Puzzle' },
];

/** The starter game names in shelf order. Convenience view over `STARTER_ENTRIES`. */
export const STARTER_GAME_NAMES: readonly string[] = STARTER_ENTRIES.map((e) => e.name);

/**
 * Cache of resolved IGDB ids, populated by `getStarterSet` in `lib/games/repo.ts` on first
 * resolution. Used by the predictor guardrail in `lib/pool-stats-service.ts` to keep starter games
 * out of `updatePoolPatternAggregates` writes. Empty until `getStarterSet` has run.
 */
const resolvedStarterIds = new Set<number>();

/** Mark the given ids as belonging to the starter set (called by `getStarterSet`). */
export function setResolvedStarterIds(ids: Iterable<number>): void {
  resolvedStarterIds.clear();
  for (const id of ids) {
    if (Number.isFinite(id)) resolvedStarterIds.add(id);
  }
}

/**
 * The IGDB ids that resolved from the starter set on the most recent `getStarterSet` call.
 * Empty until `getStarterSet` has run in this process. Predictor-guard callers should treat
 * an empty set as "no starters resolved / not yet initialized" (i.e. no filtering needed).
 */
export function getStarterSetIds(): Set<number> {
  return new Set(resolvedStarterIds);
}
