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
 * Every game below is also referenced by at least one persona in `scripts/seed-pool-patterns.ts`
 * (so co-occurrence edges already exist for it), except Limbo and Inside which are added to the
 * Indie + Cinematic personas by the same script. `getStarterSet` loads them by IGDB id, so a game
 * missing from the `games` collection is silently skipped rather than crashing the shelf.
 *
 * Predictor guardrail: `lib/pool-stats-service.ts` excludes `STARTER_IDS` from
 * `updatePoolPatternAggregates` writes — real users can't inflate Witcher 3 et al. into universal
 * popularity hubs. Starter edges stay anchored by the curated persona data only.
 */

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
export const STARTER_ENTRIES = [
  { igdbId: 1942, name: 'The Witcher 3: Wild Hunt', category: 'RPG' },
  { igdbId: 119133, name: 'Elden Ring', category: 'Soulslike' },
  { igdbId: 237895, name: 'The Legend of Zelda: Breath of the Wild', category: 'Adventure' },
  { igdbId: 113112, name: 'Hades', category: 'Indie' },
  { igdbId: 109462, name: 'Animal Crossing: New Horizons', category: 'Cozy' },

  { igdbId: 19686, name: 'Resident Evil 2', category: 'Horror' },
  { igdbId: 1009, name: 'The Last of Us', category: 'Story' },
  { igdbId: 103298, name: 'Doom Eternal', category: 'Shooter' },
  { igdbId: 7789, name: 'The Binding of Isaac: Rebirth', category: 'Roguelike' },
  { igdbId: 114283, name: 'Persona 5 Royal', category: 'JRPG' },

  { igdbId: 141503, name: 'Forza Horizon 5', category: 'Racing' },
  { igdbId: 19130, name: "Sid Meier's Civilization VI", category: 'Strategy' },
  { igdbId: 72, name: 'Portal 2', category: 'Puzzle' },
  { igdbId: 472, name: 'The Elder Scrolls 5: Skyrim', category: 'RPG' },
  { igdbId: 7334, name: 'Bloodborne', category: 'Soulslike' },

  { igdbId: 1074, name: 'Super Mario 64', category: 'Adventure' },
  { igdbId: 14593, name: 'Hollow Knight', category: 'Indie' },
  { igdbId: 135400, name: 'Minecraft', category: 'Cozy' },
  { igdbId: 222341, name: 'Silent Hill 2', category: 'Horror' },
  { igdbId: 19560, name: 'God of War', category: 'Story' },

  { igdbId: 233, name: 'Half-Life 2', category: 'Shooter' },
  { igdbId: 40477, name: 'Slay the Spire', category: 'Roguelike' },
  { igdbId: 427, name: 'Final Fantasy 7', category: 'JRPG' },
  { igdbId: 2350, name: 'Mario Kart 8', category: 'Racing' },
  { igdbId: 124954, name: 'Crusader Kings 3', category: 'Strategy' },

  { igdbId: 1331, name: 'Limbo', category: 'Puzzle' },
  { igdbId: 119171, name: "Baldur's Gate 3", category: 'RPG' },
  { igdbId: 76882, name: 'Sekiro: Shadows Die Twice', category: 'Soulslike' },
  { igdbId: 17000, name: 'Stardew Valley', category: 'Indie' },
  { igdbId: 111, name: 'Amnesia: The Dark Descent', category: 'Horror' },

  { igdbId: 25076, name: 'Red Dead Redemption 2', category: 'Story' },
  { igdbId: 26855, name: 'Dead Cells', category: 'Roguelike' },
  { igdbId: 11208, name: 'NieR: Automata', category: 'JRPG' },
  { igdbId: 11198, name: 'Rocket League', category: 'Racing' },
  { igdbId: 10919, name: 'XCOM 2', category: 'Strategy' },

  { igdbId: 7342, name: 'Inside', category: 'Puzzle' },
] as const;

/** The starter game names in shelf order. Convenience view over `STARTER_ENTRIES`. */
export const STARTER_GAME_NAMES: readonly string[] = STARTER_ENTRIES.map((e) => e.name);

/** The starter IGDB ids, iterating in shelf order. */
export const STARTER_IDS: ReadonlySet<number> = new Set(STARTER_ENTRIES.map((e) => e.igdbId));
