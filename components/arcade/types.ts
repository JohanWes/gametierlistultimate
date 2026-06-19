import type { Game } from '@/lib/games/types';
import type { RankingOutcome, Tier } from '@/lib/ranking';

/**
 * Every minigame is a self-contained component with this shape. It receives the games for the
 * round (in matchup order — anchor/challenger first where relevant) and emits one or more typed
 * engine outcomes via `onComplete`. Most emit a single outcome; the gauntlet emits several.
 */
export interface MinigameProps {
  games: Game[];
  anchorId?: number;
  boundary?: Tier;
  onComplete: (outcomes: RankingOutcome[]) => void;
}
