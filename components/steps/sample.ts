import type { Game } from '@/lib/games/types';
import type { Tier } from '../ui/Row';

/**
 * Placeholder games used only to demonstrate the design-system primitives in the Phase 3
 * shell (welcome ladder + reveal stub). Real games come from the APIs in later phases.
 * No covers — exercises the GameCard title fallback.
 */
function demoGame(igdbId: number, title: string): Game {
  return {
    igdbId,
    title,
    coverUrl: null,
    genres: [],
    platforms: [],
    releaseYear: null,
    popularity: null,
    rating: null,
    summary: null,
    hasCover: false,
    category: null,
  };
}

export const SAMPLE_TIERS: Record<Tier, Game[]> = {
  S: [demoGame(1, 'Breath of the Wild'), demoGame(2, 'Hollow Knight'), demoGame(3, 'Portal 2')],
  A: [demoGame(4, 'Hades'), demoGame(5, 'Elden Ring'), demoGame(6, 'Celeste')],
  B: [demoGame(7, 'Stardew Valley'), demoGame(8, 'Outer Wilds')],
  C: [demoGame(9, 'Doom Eternal'), demoGame(10, 'Cuphead')],
  D: [demoGame(11, 'Fallout 4')],
  E: [demoGame(12, 'No Man’s Sky')],
  F: [demoGame(13, 'Battlefield 2042')],
};
