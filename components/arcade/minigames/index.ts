import type { ComponentType } from 'react';

import type { MinigameKind } from '@/lib/ranking/arcade';

import { Bracket } from './Bracket';
import { BucketSort } from './BucketSort';
import { Champion } from './Champion';
import { Duel } from './Duel';
import { Gauntlet } from './Gauntlet';
import { HigherLower } from './HigherLower';
import { KeepTwo } from './KeepTwo';
import { Lineup } from './Lineup';
import { Podium } from './Podium';
import { Promotion } from './Promotion';
import { ReplayTest } from './ReplayTest';
import { Rivalry } from './Rivalry';
import { Sacrifice } from './Sacrifice';
import { VibeMeter } from './VibeMeter';
import type { MinigameProps } from '../types';

/** Maps an arcade round's kind to the component that plays it. */
export const MINIGAMES: Record<MinigameKind, ComponentType<MinigameProps>> = {
  duel: Duel,
  rivalry: Rivalry,
  promotion: Promotion,
  lineup: Lineup,
  keep2kill3: KeepTwo,
  sacrifice: Sacrifice,
  champion: Champion,
  'higher-lower': HigherLower,
  gauntlet: Gauntlet,
  replay: ReplayTest,
  vibe: VibeMeter,
  bucket: BucketSort,
  bracket: Bracket,
  podium: Podium,
};
