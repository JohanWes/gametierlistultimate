'use client';

import { useMemo } from 'react';

import type { SnapshotGame, TierMap } from '@/lib/lists-repo';

import { TierBoard } from './TierBoard';

interface SharedBoardProps {
  tiers: TierMap;
  games: SnapshotGame[];
}

/** Read-only tier list for a published snapshot (the public /s/:shareId view). */
export function SharedBoard({ tiers, games }: SharedBoardProps) {
  const gamesById = useMemo(() => new Map(games.map((g) => [g.igdbId, g])), [games]);
  return <TierBoard tiers={tiers} gamesById={gamesById} />;
}
